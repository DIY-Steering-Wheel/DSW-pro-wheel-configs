@echo off
setlocal

where python >nul 2>&1
if errorlevel 1 (
  echo Python nao encontrado. Instale o Python 3.10+ e tente novamente.
  pause
  exit /b 1
)

echo Atualizando pip...
python -m pip install --upgrade pip
if errorlevel 1 goto :err

echo Instalando dependencias...
python -m pip install pywebview pyserial pyusb intelhex
if errorlevel 1 goto :err

echo.
echo Dependencias instaladas com sucesso.
:done
pause
exit /b 0

:err
echo.
echo Falha na instalacao das dependencias.
pause
exit /b 1
