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

# ---------------------------------------------------------------------
# RODAR DE NOVO NAO PODE APAGAR O QUE JA ESTAVA
# ---------------------------------------------------------------------
#
# Este instalador tambem e o atualizador: quando sai versao nova do
# extrator, e ele que se roda de novo. So que ele reescrevia o .env do
# zero, e isso custava duas coisas:
#
#   1. toda resposta tinha de ser digitada de novo, inclusive senha de
#      banco e chaves de worker, na frente do cliente;
#   2. as linhas que ele NAO pergunta (FB_COLUNA_MINIMO,
#      FB_COLUNA_VALIDADE, e qualquer outra que alguem tenha posto a
#      mao) sumiam em silencio. A analise de validade e de estoque
#      minimo parava de vir, sem erro nenhum na tela.
#
# Agora ele LE o .env que estiver la, oferece cada valor como padrao e
# devolve no fim tudo que nao perguntou.

function LerEnv($caminho) {

    $mapa = @{}

    if (-not (Test-Path $caminho)) { return $mapa }

    foreach ($linha in (Get-Content $caminho)) {

        $texto = $linha.Trim()

        if ($texto -eq "") { continue }
        if ($texto.StartsWith("#")) { continue }

        $corte = $texto.IndexOf("=")
        if ($corte -lt 1) { continue }

        $chave = $texto.Substring(0, $corte).Trim()
        $valor = $texto.Substring($corte + 1).Trim()

        $mapa[$chave] = $valor
    }

    return $mapa
}

# Pergunta mostrando o valor de hoje. Enter mantem.
function Perguntar($rotulo, $atual, $padrao) {

    $sugestao = $atual
    if ([string]::IsNullOrWhiteSpace($sugestao)) { $sugestao = $padrao }

    if ([string]::IsNullOrWhiteSpace($sugestao)) {
        return Read-Host $rotulo
    }

    $resposta = Read-Host "$rotulo [Enter = $sugestao]"
    if ([string]::IsNullOrWhiteSpace($resposta)) { return $sugestao }

    return $resposta
}

# Idem, mas para senha e chave: NAO mostra o valor na tela.
# Quem instala costuma estar na frente do dono da farmacia, e o
# historico do PowerShell guarda o que aparece.
function PerguntarSegredo($rotulo, $atual, $padrao) {

    if (-not [string]::IsNullOrWhiteSpace($atual)) {
        $resposta = Read-Host "$rotulo [Enter = manter a atual]"
        if ([string]::IsNullOrWhiteSpace($resposta)) { return $atual }
        return $resposta
    }

    $resposta = Read-Host $rotulo
    if ([string]::IsNullOrWhiteSpace($resposta)) { return $padrao }

    return $resposta
}

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

# O que ja estava configurado nesta maquina. Vazio numa instalacao nova.
$caminhoEnv = Join-Path $pastaDestino ".env"
$antigo = LerEnv $caminhoEnv

if ($antigo.Count -gt 0) {
    Escrever ""
    Escrever "Achei uma instalacao anterior aqui - os valores de hoje aparecem" "Green"
    Escrever "entre colchetes. Enter mantem cada um." "Green"
}

# --- 2. Dados de conexao do Firebird ---
Escrever ""
Escrever "--- Dados de conexao do banco Firebird ---" "Cyan"

$caminhoBanco = Perguntar "Caminho completo do arquivo .FDB (ex: C:\Farmax\ITAFARMAX.FDB)" $antigo["FB_DATABASE"] ""
while ([string]::IsNullOrWhiteSpace($caminhoBanco)) {
    Escrever "Esse campo e obrigatorio." "Yellow"
    $caminhoBanco = Read-Host "Caminho completo do arquivo .FDB"
}

$host_ = Perguntar "Host do Firebird" $antigo["FB_HOST"] "localhost"
$porta = Perguntar "Porta do Firebird" $antigo["FB_PORT"] "3050"
$usuario = Perguntar "Usuario do Firebird" $antigo["FB_USER"] "SYSDBA"

# Sem -AsSecureString de propósito: o valor vai direto pro .env em
# texto puro de qualquer forma (não tem o que esconder depois), e a
# conversão SecureString -> texto (Marshal/BSTR) estava deixando um
# caractere escondido no final do valor, quebrando o cabeçalho HTTP
# quando a chave era usada (erro real, visto na prática).
$senhaTexto = PerguntarSegredo "Senha do Firebird" $antigo["FB_PASSWORD"] "masterkey"

# A filial e DESTA loja e nao pode ser copiada da anterior: errada aqui,
# o estoque de uma filial vai para o site de outra.
$filial = Perguntar "Numero da filial (ver tabela FILIAIS no banco)" $antigo["FB_FILIAL"] ""
while (-not ($filial -match '^\d+$')) {
    Escrever "Precisa ser um numero inteiro (0, 1, 2...)." "Yellow"
    $filial = Read-Host "Numero da filial"
}

# --- 2.5. Avisar o painel do site (opcional) ---
Escrever ""
Escrever "--- Enviar a planilha pro painel do site (opcional) ---" "Cyan"
Escrever "Deixa em branco se nao quiser isso agora - da pra configurar depois editando o .env." "DarkGray"

$uploadUrl = Perguntar "Endereco do worker de imagens (ex: https://imagens-proxy.SEUNOME.workers.dev)" $antigo["UPLOAD_URL"] ""
$uploadKey = ""
if (-not [string]::IsNullOrWhiteSpace($uploadUrl)) {
    $uploadUrl = $uploadUrl.TrimEnd("/")
    # Mesmo motivo do campo de senha acima: sem -AsSecureString, pra
    # não deixar caractere escondido no valor.
    $uploadKey = PerguntarSegredo "Chave (X-Imagens-Key) desse worker" $antigo["UPLOAD_KEY"] ""
}

# --- 2.6. Fotografia de estoque (opcional) ---
# Outro destino e outra chave: o catalogo vai pro worker de imagens, e o
# estoque vai pro de pedidos, que e quem guarda o historico que a aba
# Estoque do painel le pra apontar ruptura e excesso.
#
# Fica aqui, e nao so no README, porque sem estas tres linhas a aba
# Estoque do painel abre vazia e nao da nenhum sinal do motivo - o
# extrator avisa em silencio no log e segue.
Escrever ""
Escrever "--- Fotografia de estoque pro painel (opcional) ---" "Cyan"
Escrever "E o que alimenta a aba Estoque: ruptura, excesso e giro." "DarkGray"
Escrever "Deixa em branco se nao quiser isso agora." "DarkGray"

$estoqueUrl = Perguntar "Endereco do worker de pedidos (ex: https://farmatech-pedidos-proxy.SEUNOME.workers.dev)" $antigo["ESTOQUE_URL"] ""
$estoqueKey = ""
$estoqueLoja = ""
if (-not [string]::IsNullOrWhiteSpace($estoqueUrl)) {
    $estoqueUrl = $estoqueUrl.TrimEnd("/")
    $estoqueKey = PerguntarSegredo "Chave (X-Estoque-Key) desse worker" $antigo["ESTOQUE_KEY"] ""
    # O apelido da loja, igual ao do dominio dela: mais-barato.drogalink.com.br
    # Sem isso a fotografia entra sem dono e o painel de uma farmacia
    # mostraria o estoque de outra.
    $estoqueLoja = Perguntar "Apelido da loja (o mesmo do endereco do site, ex: mais-barato)" $antigo["ESTOQUE_LOJA"] ""
}

# --- 3. Gravar o .env ---
# Nao vira pergunta: ninguem troca o nome do arquivo na instalacao, e
# cada pergunta a mais e uma chance a mais de errar na frente do dono.
# Se alguem ja tiver trocado a mao, o valor dele fica.
$saida = $antigo["SAIDA_ARQUIVO"]
if ([string]::IsNullOrWhiteSpace($saida)) { $saida = "produtos_extraidos.xlsx" }

$linhas = @(
    "FB_DATABASE=$caminhoBanco",
    "FB_HOST=$host_",
    "FB_PORT=$porta",
    "FB_USER=$usuario",
    "FB_PASSWORD=$senhaTexto",
    "FB_FILIAL=$filial",
    "SAIDA_ARQUIVO=$saida",
    "UPLOAD_URL=$uploadUrl",
    "UPLOAD_KEY=$uploadKey",
    "ESTOQUE_URL=$estoqueUrl",
    "ESTOQUE_KEY=$estoqueKey",
    "ESTOQUE_LOJA=$estoqueLoja"
)

# O que estava no .env e este instalador nao pergunta volta como estava.
#
# E o caso do FB_COLUNA_MINIMO e do FB_COLUNA_VALIDADE: instalacoes que
# usam essas colunas perdiam as duas a cada atualizacao, e a analise de
# validade parava de vir sem ninguem notar. Vale para qualquer linha que
# alguem tenha posto a mao, hoje ou um dia.
$perguntadas = @("FB_DATABASE","FB_HOST","FB_PORT","FB_USER","FB_PASSWORD",
                 "FB_FILIAL","SAIDA_ARQUIVO","UPLOAD_URL","UPLOAD_KEY",
                 "ESTOQUE_URL","ESTOQUE_KEY","ESTOQUE_LOJA")

$mantidas = @()
foreach ($chave in $antigo.Keys) {
    if ($perguntadas -notcontains $chave) {
        $linhas += "$chave=" + $antigo[$chave]
        $mantidas += $chave
    }
}

Set-Content -Path $caminhoEnv -Value ($linhas -join "`r`n") -Encoding UTF8
Escrever "Arquivo .env gravado." "Green"

if ($mantidas.Count -gt 0) {
    Escrever ("Mantive o que ja estava: " + ($mantidas -join ", ")) "Green"
}

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

while (-not ($horario -match '^([01][0-9]|2[0-3]):[0-5][0-9]$')) {
    Escrever "Formato HH:MM, de 00:00 a 23:59." "Yellow"
    $horario = Read-Host "Horario pra rodar todo dia"
}

# Um .bat dedicado, em vez de "&&" dentro do /TR do schtasks - aninhar
# aspas e "&&" ali quebra dependendo de como o Windows re-tokeniza a
# linha (aconteceu na prática: "Argumento/opcao invalido - '&&'").
# Apontar a tarefa direto pro .bat evita esse problema de vez.
$caminhoRodarBat = Join-Path $pastaDestino "rodar.bat"
$conteudoRodarBat = @"
@echo off
cd /d "%~dp0"
extrator.exe >> extracao.log 2>&1
"@
Set-Content -Path $caminhoRodarBat -Value $conteudoRodarBat -Encoding ASCII

$nomeTarefa = "FarmaTechExtratorFirebird"

# O PC DA FARMACIA NAO FICA LIGADO DE MADRUGADA
#
# Esta e a falha silenciosa que o agendamento tinha: a tarefa marcada
# para as 06:00 so roda se a maquina estiver ligada as 06:00. Numa
# farmacia que abre as 8h e desliga o PC a noite, ela NUNCA roda - e o
# sintoma e a aba Estoque vazia para sempre, sem erro em lugar nenhum.
#
# O "StartWhenAvailable" resolve: horario perdido, roda assim que o PC
# liga. Ele nao existe no schtasks, so no agendador do PowerShell
# (Windows 8/2012 pra cima). Em Windows mais velho cai no schtasks de
# antes, que e melhor que nada - e a mensagem avisa.
$agendou = $false

try {

    $acao = New-ScheduledTaskAction -Execute $caminhoRodarBat
    $gatilho = New-ScheduledTaskTrigger -Daily -At (Get-Date $horario)

    # IgnoreNew: se uma extracao demorar e cair em cima da proxima, a
    # segunda e descartada em vez de as duas disputarem o banco.
    $opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew

    # Numa linha so, sem crase de continuacao: crase com um espaco
    # depois para de continuar a linha, e isso e invisivel em qualquer
    # editor - erro que so aparece no PC do cliente.
    Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Trigger $gatilho -Settings $opcoes -Force | Out-Null

    $agendou = $true
    Escrever "Tarefa agendada '$nomeTarefa' criada - roda todo dia as $horario." "Green"
    Escrever "Se o PC estiver desligado na hora, ela roda assim que ele ligar." "Green"

} catch {

    $agendou = $false

}

if (-not $agendou) {

    schtasks /Create /F /SC DAILY /ST $horario /TN $nomeTarefa /TR "`"$caminhoRodarBat`"" /RL LIMITED | Out-Null

    if ($LASTEXITCODE -eq 0) {
        Escrever "Tarefa agendada '$nomeTarefa' criada - roda todo dia as $horario." "Green"
        Escrever "ATENCAO: neste Windows ela so roda se o PC estiver ligado as $horario." "Yellow"
        Escrever "Se a farmacia desliga o PC a noite, escolha um horario de expediente." "Yellow"
    } else {
        Escrever "Nao consegui criar a tarefa agendada automaticamente." "Yellow"
        Escrever "Cria manualmente no Agendador de Tarefas apontando pra $caminhoRodarBat" "Yellow"
    }

}

Escrever ""
Escrever "=== Instalacao concluida ===" "Cyan"
Escrever "Pasta: $pastaDestino"
Escrever "Log de cada execucao: $pastaDestino\extracao.log"
Escrever ""
Escrever "Antes de sair da loja, confira no log:" "Cyan"
Escrever "  - a PRIMEIRA linha diz a versao do extrator" "DarkGray"
Escrever "  - o FIM precisa falar de estoque. Se disser que ESTOQUE_URL nao" "DarkGray"
Escrever "    esta configurado, a aba Estoque do painel vai abrir vazia." "DarkGray"
Escrever ""
Read-Host "Pressione Enter pra fechar"
