@echo off
setlocal
cd /d "%~dp0"
if not exist logs mkdir logs
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "DIA=%%i"
if not defined DIA exit /b 1
echo [%date% %time%] Inicio >> "logs\vendas-%DIA%.log"
extrator-vendas-matriz.exe --enviar >> "logs\vendas-%DIA%.log" 2>&1
set "RC=%ERRORLEVEL%"
echo [%date% %time%] Exit code %RC% >> "logs\vendas-%DIA%.log"
powershell -NoProfile -Command "Get-ChildItem -LiteralPath logs -Filter 'vendas-*.log' -File | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item -Force" >> "logs\vendas-%DIA%.log" 2>&1
exit /b %RC%
