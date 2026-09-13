@echo off
title Scoot with Friends
cd /d "%~dp0"
"runtime\node.exe" "server.cjs"
if errorlevel 1 pause
