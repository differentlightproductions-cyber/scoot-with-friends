@echo off
title Scoot with Friends - Join LAN
cd /d "%~dp0"
"runtime\node.exe" "lan-start.cjs" join
if errorlevel 1 pause
