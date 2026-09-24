@echo off
title Scoot with Friends - LAN Host
cd /d "%~dp0"
"runtime\node.exe" "lan-start.cjs" host
if errorlevel 1 pause
