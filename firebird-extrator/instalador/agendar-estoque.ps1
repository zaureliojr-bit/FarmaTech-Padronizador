param([string]$Pasta = "C:\FarmaTechExtrator")

$ErrorActionPreference = "Stop"
$Pasta = (Resolve-Path -LiteralPath $Pasta).Path
$extrator = Join-Path $Pasta "extrator.exe"
if (-not (Test-Path -LiteralPath $extrator -PathType Leaf)) {
    throw "Nao encontrei extrator.exe em $Pasta."
}

$rodar = Join-Path $Pasta "rodar-estoque-vitrine.bat"
@'
@echo off
cd /d "%~dp0"
echo [%date% %time%] >> estoque-vitrine.log
extrator.exe --estoque-vitrine >> estoque-vitrine.log 2>&1
exit /b %errorlevel%
'@ | Set-Content -LiteralPath $rodar -Encoding ASCII

# Confirma a leitura e a publicacao antes de deixar a tarefa rodando.
& $rodar
$codigo = $LASTEXITCODE
$ultimaLinha = Get-Content -LiteralPath (Join-Path $Pasta "estoque-vitrine.log") -Tail 1
if ($codigo -ne 0 -or $ultimaLinha -notmatch '^Estoque da vitrine confirmado em ') {
    throw "Falha no teste. Confira estoque-vitrine.log antes de agendar."
}

$nome = "FarmaTechEstoqueVitrine"
$acao = New-ScheduledTaskAction -Execute $rodar -WorkingDirectory $Pasta
$inicio = (Get-Date).AddHours(2)
$gatilho = New-ScheduledTaskTrigger -Once -At $inicio -RepetitionInterval (New-TimeSpan -Hours 2)
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $opcoes -Force | Out-Null
Write-Host "Tarefa $nome criada. Proxima execucao: $inicio. Log: $Pasta\estoque-vitrine.log"
