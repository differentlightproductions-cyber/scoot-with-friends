@echo off
title Scoot with Friends - Owner Edition
cd /d "%~dp0"
set SWF_ADMIN=1
"runtime\node.exe" "server.cjs"
if errorlevel 1 pause
