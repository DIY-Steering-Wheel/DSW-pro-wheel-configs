import os
from typing import Dict, List

import webview

from backend import ProfileStore, SerialBackend
from ui_registry import get_ui_schema


class Api:
    def __init__(self):
        self._schema = get_ui_schema()
        self._serial = SerialBackend()
        self._profiles = ProfileStore()

    @staticmethod
    def _first_path(selection):
        if not selection:
            return None
        if isinstance(selection, (list, tuple)):
            return selection[0] if selection else None
        return selection

    def get_ui_schema(self) -> Dict:
        return self._schema

    def list_ports(self) -> List[Dict]:
        return self._serial.list_ports()

    def connect(self, port_name: str) -> Dict:
        ok = self._serial.connect(port_name)
        return {"ok": ok, "status": self.get_status()}

    def disconnect(self) -> Dict:
        self._serial.disconnect()
        return {"ok": True, "status": self.get_status()}

    def get_status(self) -> Dict:
        status = self._serial.get_status()
        return {
            "connected": status.connected,
            "port": status.port,
            "supported": status.supported,
            "fw": status.fw,
            "hw": status.hw,
            "heapfree": status.heapfree,
            "temp": status.temp,
        }

    def get_active_classes(self) -> List[Dict]:
        return self._serial.get_active_tabs()

    def get_main_classes(self) -> Dict:
        return self._serial.get_main_classes()

    def get_class_definitions(self) -> Dict:
        return self._serial.get_class_definitions()

    def apply_class_definitions(self, payload: Dict) -> Dict:
        return {"ok": self._serial.apply_class_definitions(payload)}

    def set_main_class(self, class_id: int) -> Dict:
        return {"ok": self._serial.set_main_class(class_id)}

    def reboot(self) -> Dict:
        return {"ok": self._serial.reboot()}

    def format_flash(self) -> Dict:
        return {"ok": self._serial.format_flash()}

    def save_to_flash(self) -> Dict:
        return {"ok": self._serial.save_to_flash()}

    def send_serial_command(self, command: str) -> str:
        """Envia um comando serial raw e retorna a resposta"""
        if not self._serial.is_connected():
            return "Erro: Nenhum dispositivo conectado"
        try:
            # Tenta parseiar como "classe comando" ou "classe comando instancia"
            parts = command.strip().split()
            if len(parts) < 2:
                return f"Erro: Formato inválido. Use: classe comando [instancia]"
            
            cls = parts[0]
            cmd = parts[1]
            instance = int(parts[2]) if len(parts) > 2 else 0
            
            result = self._serial.request(cls, cmd, instance=instance)
            return result if result is not None else "Sem resposta"
        except ValueError as e:
            return f"Erro: {str(e)}"
        except Exception as e:
            return f"Erro: {str(e)}"

    def get_profiles(self) -> Dict:
        return {
            "current": self._profiles.get_current_profile(),
            "profiles": self._profiles.list_profiles(),
        }

    def select_profile(self, name: str) -> Dict:
        return {"ok": self._profiles.select_profile(name), "current": self._profiles.get_current_profile()}

    def create_profile(self, name: str) -> Dict:
        return {"ok": self._profiles.create_profile(name), "profiles": self._profiles.list_profiles()}

    def rename_profile(self, old: str, new: str) -> Dict:
        return {"ok": self._profiles.rename_profile(old, new), "profiles": self._profiles.list_profiles()}

    def delete_profile(self, name: str) -> Dict:
        return {"ok": self._profiles.delete_profile(name), "profiles": self._profiles.list_profiles()}

    def save_profile_from_board(self, name: str) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        data = []
        call_order = self._profiles.get_call_order()
        active = self._serial.request("sys", "lsactive")
        if not active:
            return {"ok": False, "error": "no_active_classes"}
        active_lines = [line.split(":") for line in active.split("\n") if line]
        for entry in call_order:
            fullname = entry.get("fullname")
            classname = entry.get("classname")
            keys = entry.get("key", [])
            for line in active_lines:
                if len(line) < 4:
                    continue
                if line[0] != fullname or line[1] != classname:
                    continue
                instance = int(line[2])
                for cmd in keys:
                    value = self._serial.request(classname, cmd, instance=instance)
                    if value is None:
                        continue
                    data.append(
                        {
                            "fullname": fullname,
                            "cls": classname,
                            "instance": instance,
                            "cmd": cmd,
                            "value": value,
                        }
                    )
        ok = self._profiles.save_profile_data(name, data)
        return {"ok": ok}

    def apply_profile_to_board(self, name: str) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        data = self._profiles.get_profile_data(name)
        for item in data:
            try:
                value = int(item["value"])
            except (ValueError, TypeError):
                continue
            self._serial.send_value(
                item["cls"],
                item["cmd"],
                value=value,
                instance=int(item.get("instance", 0)),
            )
        return {"ok": True}

    def set_class_active(self, class_id: int, enabled: bool) -> Dict:
        ok = self._serial.set_class_active(class_id, enabled)
        if not ok:
            return {"ok": False, "error": "unsupported"}
        return {"ok": True}

    def export_profile(self, name: str) -> Dict:
        if not name or name == "None":
            return {"ok": False, "error": "invalid_profile"}
        selection = webview.windows[0].create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=f"{name}.json",
            file_types=("JSON (*.json)",),
        )
        path = self._first_path(selection)
        if not path:
            return {"ok": False, "error": "canceled"}
        ok = self._profiles.export_profile(name, path)
        return {"ok": ok}

    def import_profile(self) -> Dict:
        selection = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("JSON (*.json)",),
        )
        path = self._first_path(selection)
        if not path:
            return {"ok": False, "error": "canceled"}
        name = self._profiles.import_profile(path)
        return {
            "ok": bool(name),
            "name": name,
            "current": self._profiles.get_current_profile(),
            "profiles": self._profiles.list_profiles(),
        }


def main():
    web_dir = os.path.join(os.path.dirname(__file__), "web")
    index_path = os.path.join(web_dir, "index.html")
    api = Api()
    webview.create_window(
        "DSW Pro Wheel Configurator",
        index_path,
        js_api=api,
      
        width=1200,
        height=780,
        min_size=(980, 620),
    )
    webview.start()


if __name__ == "__main__":
    main()
