@echo off
REM Roda a extracao e grava um log com data/hora - pensado pra ser
REM chamado pelo Agendador de Tarefas do Windows, sem precisar abrir
REM nada na mao. Funciona de qualquer pasta porque entra sozinho na
REM pasta onde este arquivo esta.

cd /d "%~dp0"

echo ============================================== >> extracao.log
echo %date% %time% - iniciando extracao >> extracao.log

node extrair.js >> extracao.log 2>&1

echo %date% %time% - fim (codigo de saida %errorlevel%) >> extracao.log
