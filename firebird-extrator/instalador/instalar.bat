@echo off
REM So um atalho pra abrir o instalar.ps1 sem precisar liberar a
REM politica de execucao do PowerShell manualmente. Da dois cliques
REM neste arquivo pra comecar a instalacao.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
