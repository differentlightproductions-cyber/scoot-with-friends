@echo off
title Scoot with Friends - Play on Phone
cd /d "%~dp0"
set SWF_PHONE=1
"runtime\node.exe" "server.cjs"
if errorlevel 1 pause
