import json
import logging
import os
from dataclasses import dataclass, asdict
from typing import Dict, List

_log = logging.getLogger(__name__)


@dataclass(frozen=True)
class UiClass:
    id: int
    key: str
    label: str
    icon: str
    description: str
    group: str


CLASS_REGISTRY: List[UiClass] = [
    UiClass(0x001, "ffb", "Force Feedback", "bi-speedometer2", "Principal FFB e filtros.", "core"),
    UiClass(0x002, "ffb_alt", "Force Feedback", "bi-speedometer2", "Principal FFB e filtros.", "core"),
    UiClass(0x003, "ffb_alt2", "Force Feedback", "bi-speedometer2", "Principal FFB e filtros.", "core"),
    UiClass(0xA01, "axis", "Eixos", "bi-sliders", "Configuracao de eixos.", "motion"),
    UiClass(0x081, "tmc4671", "TMC4671", "bi-cpu", "Controle de motor TMC.", "motion"),
    UiClass(0x082, "tmc4671_alt", "TMC4671", "bi-cpu", "Controle de motor TMC.", "motion"),
    UiClass(0x083, "tmc4671_alt2", "TMC4671", "bi-cpu", "Controle de motor TMC.", "motion"),
    UiClass(0x084, "pwm", "PWM Driver", "bi-sine-wave", "Driver PWM.", "motion"),
    UiClass(0x00D, "midi", "MIDI", "bi-music-note-beamed", "Entrada MIDI.", "io"),
    UiClass(0x00B, "tmcdebug", "TMC Debug", "bi-bug", "Diagnostico do motor.", "debug"),
    UiClass(0x085, "odrive", "ODrive", "bi-cpu", "Controle ODrive.", "motion"),
    UiClass(0x086, "odrive_alt", "ODrive", "bi-cpu", "Controle ODrive.", "motion"),
    UiClass(0x087, "vesc", "VESC", "bi-cpu", "Controle VESC.", "motion"),
    UiClass(0x088, "vesc_alt", "VESC", "bi-cpu", "Controle VESC.", "motion"),
    UiClass(0x089, "simplemotion", "SimpleMotion", "bi-cpu", "Controle SimpleMotion.", "motion"),
    UiClass(0x08A, "simplemotion_alt", "SimpleMotion", "bi-cpu", "Controle SimpleMotion.", "motion"),
    UiClass(0xA02, "effects", "Efeitos", "bi-lightning-charge", "Monitor de efeitos.", "core"),
    UiClass(0x08B, "rmd", "RMD", "bi-cpu", "Controle RMD.", "motion"),
    UiClass(0x08C, "rmd_alt", "RMD", "bi-cpu", "Controle RMD.", "motion"),
    UiClass(0x005, "canremote", "CAN Remote", "bi-broadcast", "Controle CAN remoto.", "io"),
    UiClass(0x090, "cananalog", "CAN Analog", "bi-broadcast", "Entradas analogicas via CAN.", "io"),
    UiClass(0x091, "adsanalog", "ADS Analog", "bi-filter-circle", "Conversor ADS111x.", "io"),
    UiClass(0x092, "canbtn", "CAN Buttons", "bi-broadcast", "Botoes digitais via CAN.", "io"),
    UiClass(0x093, "pcfbtn", "PCF Buttons", "bi-toggle-on", "Botoes via PCF8574.", "io"),
]

ICON_BY_CLSNAME = {
    "ffb": "bi-speedometer2",
    "axis": "bi-sliders",
    "tmc": "bi-cpu",
    "tmc4671": "bi-cpu",
    "tmcdebug": "bi-bug",
    "pwm": "bi-soundwave",
    "midi": "bi-music-note-beamed",
    "analog": "bi-filter-circle",
    "encoder": "bi-disc",
    "button": "bi-toggle-on",
    "expo": "bi-graph-up",
    "odrive": "bi-cpu",
    "vesc": "bi-cpu",
    "simplemotion": "bi-cpu",
    "rmd": "bi-cpu",
    "serial": "bi-usb-plug",
    "dfu": "bi-cloud-arrow-down",
    "profile": "bi-collection",
    "can": "bi-broadcast",
    "effects": "bi-lightning-charge",
    "pcf": "bi-toggle-on",
    "pcfbtn": "bi-toggle-on",
    "ads": "bi-filter-circle",
    "adsanalog": "bi-filter-circle",
    "cananalog": "bi-broadcast",
    "canbtn": "bi-broadcast",
}

LABEL_BY_CLSNAME = {
    "ffb": "Force Feedback",
    "axis": "Eixos",
    "tmc": "TMC",
    "tmc4671": "TMC4671",
    "tmcdebug": "TMC Debug",
    "pwm": "PWM Driver",
    "midi": "MIDI",
    "analog": "Analog",
    "encoder": "Encoder",
    "button": "Botoes",
    "expo": "Expo",
    "odrive": "ODrive",
    "vesc": "VESC",
    "simplemotion": "SimpleMotion",
    "rmd": "RMD",
    "serial": "Serial",
    "dfu": "DFU",
    "profile": "Perfis",
    "can": "CAN Remote",
    "effects": "Efeitos",
    "pcf": "PCF Buttons",
    "pcfbtn": "PCF Buttons",
    "ads": "ADS Analog",
    "adsanalog": "ADS Analog",
    "cananalog": "CAN Analog",
    "canbtn": "CAN Buttons",
}

MENU_SECTIONS = [
    {"key": "dashboard", "label": "Painel", "icon": "bi-grid-1x2"},
    {"key": "connection", "label": "Conexao", "icon": "bi-usb-plug"},
    {"key": "profiles", "label": "Perfis", "icon": "bi-collection"},
    {"key": "motion", "label": "Motores e Eixos", "icon": "bi-gear-wide-connected"},
    {"key": "effects", "label": "Efeitos", "icon": "bi-lightning"},
    {"key": "firmware", "label": "Firmware", "icon": "bi-cpu"},
    {"key": "logs", "label": "Logs", "icon": "bi-journal-text"},
]

COMMAND_INDEX = {
    "sys": ["lsactive", "swver", "reboot", "flashdump", "flashraw", "heapfree", "temp", "debug"],
    "main": ["id"],
}


def get_ui_schema() -> Dict:
    return {
        "menu": MENU_SECTIONS,
        "classes": [asdict(item) for item in CLASS_REGISTRY],
        "commands": COMMAND_INDEX,
    }


def parse_lsactive(reply: str) -> List[Dict]:
    lines = [line.split(":") for line in reply.split("\n") if line]
    active = []
    for items in lines:
        if len(items) < 4:
            continue
        active.append(
            {
                "name": items[0],
                "clsname": items[1],
                "unique": int(items[2]),
                "id": int(items[3]),
            }
        )
    return active


def _class_info_by_id(class_id: int) -> UiClass:
    for item in CLASS_REGISTRY:
        if item.id == class_id:
            return item
    return UiClass(class_id, "unknown", "Desconhecido", "bi-question-circle", "Classe nao registrada.", "misc")


def build_tabs_from_lsactive(reply: str) -> List[Dict]:
    active = parse_lsactive(reply)
    tabs = []
    for item in active:
        info = _class_info_by_id(item["id"])
        clsname = item.get("clsname", "").lower()
        if info.key == "unknown" and clsname:
            for key, icon in ICON_BY_CLSNAME.items():
                if key in clsname:
                    info = UiClass(
                        item["id"],
                        clsname,
                        LABEL_BY_CLSNAME.get(key, item["name"]),
                        icon,
                        "Classe ativa.",
                        "misc",
                    )
                    break
        axis_hint = (
            f" {item['unique']}"
            if item["id"]
            in {
                0xA01,
                0x081,
                0x082,
                0x083,
                0x085,
                0x086,
                0x087,
                0x088,
                0x089,
                0x08A,
                0x08B,
                0x08C,
            }
            else ""
        )
        tabs.append(
            {
                "id": item["id"],
                "key": f"{item['clsname']}:{item['unique']}",
                "title": f"{item['name']}{axis_hint}",
                "name": item["name"],
                "clsname": item["clsname"],
                "label": info.label,
                "icon": info.icon,
                "description": info.description,
                "group": info.group,
            }
        )
    return tabs


def load_adjacent_configs(web_dir: str) -> List[Dict]:
    root = os.path.join(web_dir, "configuracoes-adjacentes")
    _log.info("load_adjacent_configs: root=%s exists=%s", root, os.path.isdir(root))
    if not os.path.isdir(root):
        _log.warning("load_adjacent_configs: directory not found: %s", root)
        return []

    configs: List[Dict] = []
    try:
        entries = list(os.scandir(root))
    except OSError as e:
        _log.error("load_adjacent_configs: scandir failed: %s", e)
        return []

    _log.info("load_adjacent_configs: scandir found %d entries: %s",
              len(entries), [e.name for e in entries])

    for entry in entries:
        _log.info("load_adjacent_configs: entry=%s is_dir=%s", entry.name, entry.is_dir())
        if not entry.is_dir():
            continue
        cfg_path = os.path.join(entry.path, "config.json")
        exists = os.path.exists(cfg_path)
        _log.info("load_adjacent_configs: cfg_path=%s exists=%s", cfg_path, exists)
        if not exists:
            continue
        try:
            with open(cfg_path, "r", encoding="utf-8-sig") as fh:
                data = json.load(fh)
            _log.info("load_adjacent_configs: parsed %s -> keys=%s", entry.name, list(data.keys()) if isinstance(data, dict) else type(data).__name__)
        except (OSError, json.JSONDecodeError) as e:
            _log.error("load_adjacent_configs: failed to read/parse %s: %s", cfg_path, e)
            continue

        if not isinstance(data, dict):
            _log.warning("load_adjacent_configs: %s data is not dict: %s", entry.name, type(data).__name__)
            continue

        slug = entry.name
        cfg_id = data.get("id") or slug
        title = data.get("title") or slug
        view = data.get("view") or f"configuracoes-adjacentes/{slug}/index.html"
        script = data.get("script") or f"configuracoes-adjacentes/{slug}/index.js"
        style = data.get("style") or f"configuracoes-adjacentes/{slug}/style.css"

        configs.append(
            {
                "id": cfg_id,
                "title": title,
                "icon": data.get("icon") or "bi-sliders",
                "class_id": data.get("class_id"),
                "clsname_match": data.get("clsname_match") or [],
                "definition_key": data.get("definition_key"),
                "definition_match": data.get("definition_match") or [],
                "requires_active": data.get("requires_active", True),
                "show_when_connected": data.get("show_when_connected", False),
                "view": view,
                "script": script,
                "style": style,
            }
        )
    return configs


def sample_lsactive() -> str:
    return "\n".join(
        [
            "FFB:ffb:0:1",
            "Axis:axis:1:2561",
            "Motor:TMC:0:129",
            "Effects:effects:0:2562",
        ]
    )
