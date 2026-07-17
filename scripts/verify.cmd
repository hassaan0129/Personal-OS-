@echo off
python "%~dp0verify.py" %*
exit /b %ERRORLEVEL%
