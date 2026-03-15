# Lamen

## Visao Geral
Este documento descreve a arquitetura, fluxos principais e pontos de extensao do configurador DSW Pro Wheel.

## Arquitetura
- **UI (Web)**: HTML/CSS/JS em `web/` renderizada via pywebview.
- **API (Python)**: `app.py` expõe funcoes para a UI via `window.pywebview.api`.
- **Backend Serial**: `backend.py` gerencia comunicacao serial e parse de respostas.
- **Registry UI**: `ui_registry.py` define classes, menu e configuracoes adjacentes.

## UI (Web)
- **Dashboard**: status de firmware, RAM, temperatura e conexao.
- **Classes**: selecao de driver, encoder e shifter.
- **Arvore de Configuracoes**: configurações adjacentes baseadas em classes ativas.
- **Perfis**: modal com lista, ativar, salvar, aplicar, renomear, importar e exportar.
- **Logs/Erros**: modal com abas para logs e tabela de erros (code/level/info).
- **Firmware Update**: modal com DFU, selecao de arquivo, upload e full erase.

## API e Fluxos
### Conexao e Status
- `list_ports`, `connect`, `disconnect`, `get_status`
- Status inclui `fw`, `hw`, `heapfree`, `temp`, `supported`

### Classes e Definicoes
- `get_class_definitions`, `apply_class_definitions`
- `get_active_classes`, `get_main_classes`

### Perfis
- `get_profiles`, `select_profile`, `create_profile`, `rename_profile`, `delete_profile`
- `save_profile_from_board`, `apply_profile_to_board`, `export_profile`, `import_profile`
- Perfis especiais: `None` e `Flash profile`

### Flash / Dump
- `save_to_flash`: salva configuracoes na flash e sincroniza `Flash profile`
- `save_flash_dump` / `load_flash_dump`: exporta/importa dump JSON (flashraw)

### Logs e Erros
- `get_errors`: retorna lista de erros do dispositivo
- `clear_errors`: limpa erros no dispositivo
- Logs UI sao mantidos no frontend para operacoes recentes

### Firmware Update (DFU)
- `dfu_enter`: envia comando DFU e desconecta serial
- `dfu_select_file`: seleciona arquivo .dfu/.hex
- `dfu_upload`: faz upload via pydfu
- `dfu_mass_erase`: full erase da flash
- `dfu_status`: status, progresso e log do processo

## Protocolos e Comandos
- Serial: comandos no formato `cls.instance.cmd?;` ou `cls.instance.cmd!;`
- Principais comandos: `sys.save`, `sys.flashdump`, `sys.flashraw`, `sys.errors`, `sys.errorsclr`

## Estrutura de Arquivos
- `app.py`: API pywebview e orquestracao
- `backend.py`: serial e parse
- `ui_registry.py`: classes e menu
- `web/index.html`: layout principal
- `web/js/app.js`: controle UI
- `web/css/theme.css`: estilos
- `web/configuracoes-adjacentes/*`: configuracoes extras

## Observacoes Operacionais
- Firmware Update depende de drivers DFU e bibliotecas USB (pyusb).
- Se DFU nao encontrar dispositivo, verifique boot0 e driver instalado.
- Dumps sao gravados como JSON com `{addr, val}`.

## Proximos Passos Recomendados
- Adicionar telemetria de RX/TX no terminal.
- Validacoes de compatibilidade de firmware.
- Melhorias de acessibilidade nos modais.
