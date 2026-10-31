@echo off
cd /d "%~dp0"
set "PY=python"
where python >nul 2>nul || set "PY=py"
%PY% "%~dp0server.py" start
echo.
echo (服务窗口：按 Ctrl+C 或直接关闭即可停止)
pause