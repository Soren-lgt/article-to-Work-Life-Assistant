@echo off
cd /d "%~dp0"
set "PY=python"
where python >nul 2>nul || set "PY=py"
%PY% "%~dp0server.py" stop
echo.
pause