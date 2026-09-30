# Instalador do Extrator Firebird -> FarmaTech Padronizador
#
# Roda no PC do cliente (onde o Farmax funciona). Pergunta os dados de
# conexao do banco, grava o .env, copia o extrator pra uma pasta fixa
# e cadastra a tarefa agendada no Windows - tudo numa passada so.
#
# Precisa estar na MESMA pasta que "extrator.exe" (gerado com
# "npm run build:exe" - ver README da pasta firebird-extrator).

$ErrorActionPreference = "Stop"

function Escrever($texto, $cor = "White") {
    Write-Host $texto -ForegroundColor $cor
}

Escrever ""
Escrever "=== Instalador - Extrator Firebird FarmaTech ===" "Cyan"
Escrever ""

$pastaScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeOrigem = Join-Path $pastaScript "extrator.exe"

if (-not (Test-Path $exeOrigem)) {
    Escrever "Nao encontrei 'extrator.exe' nesta pasta ($pastaScript)." "Red"
    Escrever "Confere se o instalador foi copiado junto com o extrator.exe." "Red"
    Read-Host "Pressione Enter pra sair"
    exit 1
}

# --- 1. Pasta de instalacao ---
$pastaPadrao = "C:\FarmaTechExtrator"
$pastaDestino = Read-Host "Pasta onde instalar (Enter pra usar '$pastaPadrao')"
if ([string]::IsNullOrWhiteSpace($pastaDestino)) { $pastaDestino = $pastaPadrao }

if (-not (Test-Path $pastaDestino)) {
    New-Item -ItemType Directory -Path $pastaDestino -Force | Out-Null
}

Copy-Item $exeOrigem (Join-Path $pastaDestino "extrator.exe") -Force
Escrever "Extrator copiado pra $pastaDestino" "Green"

# --- 2. Dados de conexao do Firebird ---
Escrever ""
Escrever "--- Dados de conexao do banco Firebird ---" "Cyan"

$caminhoBanco = Read-Host "Caminho completo do arquivo .FDB (ex: C:\Farmax\ITAFARMAX.FDB)"
while ([string]::IsNullOrWhiteSpace($caminhoBanco)) {
    Escrever "Esse campo e obrigatorio." "Yellow"
    $caminhoBanco = Read-Host "Caminho completo do arquivo .FDB"
}

$host_ = Read-Host "Host do Firebird (Enter pra 'localhost')"
if ([string]::IsNullOrWhiteSpace($host_)) { $host_ = "localhost" }

$porta = Read-Host "Porta do Firebird (Enter pra '3050')"
if ([string]::IsNullOrWhiteSpace($porta)) { $porta = "3050" }

$usuario = Read-Host "Usuario do Firebird (Enter pra 'SYSDBA')"
if ([string]::IsNullOrWhiteSpace($usuario)) { $usuario = "SYSDBA" }

$senhaSegura = Read-Host "Senha do Firebird (Enter pra 'masterkey')" -AsSecureString
$senhaTexto = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($senhaSegura)
)
if ([string]::IsNullOrWhiteSpace($senhaTexto)) { $senhaTexto = "masterkey" }

$filial = Read-Host "Numero da filial (ver tabela FILIAIS no banco)"
while (-not ($filial -match '^\d+$')) {
    Escrever "Precisa ser um numero inteiro (0, 1, 2...)." "Yellow"
    $filial = Read-Host "Numero da filial"
}

# --- 2.5. Avisar o painel do site (opcional) ---
Escrever ""
Escrever "--- Enviar a planilha pro painel do site (opcional) ---" "Cyan"
Escrever "Deixa em branco se nao quiser isso agora - da pra configurar depois editando o .env." "DarkGray"

$uploadUrl = Read-Host "Endereco do worker de imagens (ex: https://imagens-proxy.SEUNOME.workers.dev)"
$uploadKey = ""
if (-not [string]::IsNullOrWhiteSpace($uploadUrl)) {
    $uploadUrl = $uploadUrl.TrimEnd("/")
    $uploadKeySegura = Read-Host "Chave (X-Imagens-Key) desse worker" -AsSecureString
    $uploadKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($uploadKeySegura)
    )
}

# --- 3. Gravar o .env ---
$conteudoEnv = @"
FB_DATABASE=$caminhoBanco
FB_HOST=$host_
FB_PORT=$porta
FB_USER=$usuario
FB_PASSWORD=$senhaTexto
FB_FILIAL=$filial
SAIDA_ARQUIVO=produtos_extraidos.xlsx
UPLOAD_URL=$uploadUrl
UPLOAD_KEY=$uploadKey
"@

Set-Content -Path (Join-Path $pastaDestino ".env") -Value $conteudoEnv -Encoding UTF8
Escrever "Arquivo .env gravado." "Green"

# --- 4. Testar a conexao agora ---
Escrever ""
$testar = Read-Host "Testar a extracao agora? (S/n)"
if ($testar -ne "n" -and $testar -ne "N") {
    Escrever "Rodando teste..." "Cyan"
    Push-Location $pastaDestino
    & ".\extrator.exe"
    $codigoSaida = $LASTEXITCODE
    Pop-Location
    if ($codigoSaida -ne 0) {
        Escrever "O teste deu erro (codigo $codigoSaida) - confere os dados digitados acima." "Red"
        Read-Host "Pressione Enter pra sair"
        exit 1
    }
    Escrever "Teste concluido - confere se o arquivo .xlsx apareceu em $pastaDestino" "Green"
}

# --- 5. Agendar tarefa diaria ---
Escrever ""
$horario = Read-Host "Horario pra rodar todo dia, formato HH:MM (Enter pra '06:00')"
if ([string]::IsNullOrWhiteSpace($horario)) { $horario = "06:00" }

$nomeTarefa = "FarmaTechExtratorFirebird"
$comando = "cmd.exe"
$argumentos = "/c `"cd /d `"$pastaDestino`" && extrator.exe >> extracao.log 2>&1`""

schtasks /Create /F /SC DAILY /ST $horario /TN $nomeTarefa /TR "$comando $argumentos" /RL LIMITED | Out-Null

if ($LASTEXITCODE -eq 0) {
    Escrever "Tarefa agendada '$nomeTarefa' criada - roda todo dia as $horario." "Green"
} else {
    Escrever "Nao consegui criar a tarefa agendada automaticamente." "Yellow"
    Escrever "Cria manualmente no Agendador de Tarefas apontando pra $pastaDestino\extrator.exe" "Yellow"
}

Escrever ""
Escrever "=== Instalacao concluida ===" "Cyan"
Escrever "Pasta: $pastaDestino"
Escrever "Log de cada execucao: $pastaDestino\extracao.log"
Escrever ""
Read-Host "Pressione Enter pra fechar"
