# DSW Pro Wheel Configurator

## Requisitos
- Windows 10/11
- Python 3.10+ (recomendado 3.11)
- Pip

## Instalacao rapida (Windows)
1. Clique duas vezes em `install_deps.bat`.
2. Aguarde finalizar.

## Instalacao manual (Windows)
Abra um terminal na pasta do projeto e rode:
```
python -m pip install --upgrade pip
python -m pip install pywebview pyserial pyusb intelhex
```

## Dependencias usadas
- `pywebview` (UI)
- `pyserial` (Serial)
- `pyusb` (DFU)
- `intelhex` (leitura de .hex)

## Execucao
```
python app.py
```

## Preview do design (sem abrir app.py)
Para validar apenas o layout HTML/CSS no navegador:
```
python -m http.server 5500
```
Depois abra:
```
http://localhost:5500/web/index.html
```
Use `Ctrl+F5` para forcar recarregamento ao editar o CSS.

## Notas
- Para DFU funcionar, pode ser necessario driver WinUSB/DFU instalado.
