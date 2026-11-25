@echo off
setlocal
cd /d "%~dp0" || exit /b 1
if not exist logs mkdir logs
if not exist logs exit /b 1
for /f %%D in ('powershell.exe -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DIA=%%D"
if not defined DIA exit /b 1
set "LOG=logs\compras-%DIA%.log"
echo [%date% %time%] Iniciando sincronizacao >> "%LOG%"
extrator-compras-incremental.exe --compras --enviar-compras-incremental >> "%LOG%" 2>&1
set "RESULTADO=%ERRORLEVEL%"
echo [%date% %time%] Finalizado - Codigo: %RESULTADO% >> "%LOG%"
rem Exclui somente logs diarios deste modulo com mais de 30 dias.
powershell.exe -NoProfile -Command "Get-ChildItem -LiteralPath 'logs' -File -Filter 'compras-*.log' | Where-Object { $_.Name -match '^compras-\d{4}-\d{2}-\d{2}\.log$' -and $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -ErrorAction Stop" >> "%LOG%" 2>&1
if errorlevel 1 echo [%date% %time%] Aviso: falha na limpeza dos logs >> "%LOG%"
exit /b %RESULTADO%
