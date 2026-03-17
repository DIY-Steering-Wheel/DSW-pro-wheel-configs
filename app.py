import os
import logging
import types
import importlib.machinery
from typing import Dict, List, Optional
import webview
import json
from backend import ProfileStore, SerialBackend
from protocol import encode_cmd
from ui_registry import get_ui_schema, load_adjacent_configs


class DfuService:
    def __init__(self, serial: SerialBackend):
        self._serial = serial
        self.selected_file: Optional[str] = None
        self.progress: int = 0
        self.busy: bool = False
        self.log: List[str] = []
        self.last_error: Optional[str] = None
        self._pydfu = None

    def _log(self, message: str) -> None:
        if not message:
            return
        self.log.append(str(message))
        if len(self.log) > 400:
            self.log = self.log[-300:]

    def _progress(self, addr, offset, size) -> None:
        if not size:
            return
        self.progress = int(offset * 100 / size)

    def _load_pydfu(self):
        if self._pydfu:
            return self._pydfu
        path = os.path.join(os.path.dirname(__file__), "dfu", "pydfu.py")
        if not os.path.exists(path):
            raise FileNotFoundError("pydfu.py nao encontrado")
        loader = importlib.machinery.SourceFileLoader("pydfu_local", path)
        module = types.ModuleType("pydfu_local")
        loader.exec_module(module)
        self._pydfu = module
        return module

    def probe_devices(self) -> Dict:
        try:
            pydfu = self._load_pydfu()
            devices = pydfu.get_dfu_devices(idVendor=0x0483, idProduct=0xDF11)
            return {"ok": True, "count": len(devices)}
        except Exception as exc:
            return {"ok": False, "count": 0, "error": str(exc)}

    def enter_dfu_mode(self) -> bool:
        if not self._serial.is_connected():
            return False
        self._serial.send_raw(encode_cmd("sys", "dfu"))
        self._serial.disconnect()
        self._log("Entrando em modo DFU...")
        return True

    def select_file(self, path: str) -> Dict:
        if not path:
            return {"ok": False, "error": "no_file"}
        self.selected_file = path
        self._log(f"Arquivo selecionado: {path}")
        return {"ok": True, "path": path}

    def upload(self, mass_erase: bool = False) -> Dict:
        if self.busy:
            return {"ok": False, "error": "busy"}
        if not self.selected_file:
            return {"ok": False, "error": "no_file"}
        self.busy = True
        self.last_error = None
        self.progress = 0
        try:
            pydfu = self._load_pydfu()
        except Exception as exc:
            self.busy = False
            self.last_error = str(exc)
            self._log(f"Erro DFU: {exc}")
            return {"ok": False, "error": "pydfu_missing"}

        try:
            dfu_devices = pydfu.get_dfu_devices(idVendor=0x0483, idProduct=0xDF11)
            if not dfu_devices:
                self._log("Nenhum dispositivo DFU encontrado.")
                return {"ok": False, "error": "no_dfu_device"}
            if len(dfu_devices) > 1:
                self._log("Multiplos dispositivos DFU detectados.")
            pydfu.init()
            elements = None
            if self.selected_file.endswith(".dfu"):
                elements = pydfu.read_dfu_file(self.selected_file)
            elif self.selected_file.endswith(".hex"):
                elements, _metadata = pydfu.read_hex_file(self.selected_file, "#")
            else:
                self._log("Arquivo nao suportado (use .dfu ou .hex).")
                return {"ok": False, "error": "unsupported_file"}

            if not elements:
                self._log("Falha ao ler o arquivo de firmware.")
                return {"ok": False, "error": "invalid_file"}

            size = sum([e.get("size", 0) for e in elements])
            self._log(f"Upload iniciado: {len(elements)} segmentos ({round(size/1024,2)}kB)")
            pydfu.write_elements(elements, mass_erase, progress=self._progress, logfunc=self._log)
            self._log("Upload concluido. Reinicie a placa.")
            return {"ok": True}
        except Exception as exc:
            self.last_error = str(exc)
            self._log(f"Erro durante upload: {exc}")
            return {"ok": False, "error": "upload_failed"}
        finally:
            try:
                self._load_pydfu().exit_dfu()
            except Exception:
                pass
            self.busy = False

    def mass_erase(self) -> Dict:
        if self.busy:
            return {"ok": False, "error": "busy"}
        self.busy = True
        self.last_error = None
        try:
            pydfu = self._load_pydfu()
            dfu_devices = pydfu.get_dfu_devices(idVendor=0x0483, idProduct=0xDF11)
            if not dfu_devices:
                self._log("Nenhum dispositivo DFU encontrado.")
                return {"ok": False, "error": "no_dfu_device"}
            pydfu.init()
            self._log("Apagando flash completa...")
            pydfu.mass_erase()
            self.progress = 100
            self._log("Flash apagada.")
            return {"ok": True}
        except Exception as exc:
            self.last_error = str(exc)
            self._log(f"Erro ao apagar: {exc}")
            return {"ok": False, "error": "erase_failed"}
        finally:
            try:
                self._load_pydfu().exit_dfu()
            except Exception:
                pass
            self.busy = False


class Api:
    def __init__(self):
        self._schema = get_ui_schema()
        self._serial = SerialBackend()
        self._profiles = ProfileStore()
        self._web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
        self._dfu = DfuService(self._serial)

    @staticmethod
    def _first_path(selection):
        if not selection:
            return None
        if isinstance(selection, (list, tuple)):
            return selection[0] if selection else None
        return selection

    @staticmethod
    def _file_dialog(mode: str, **kwargs):
        dialog_type = None
        try:
            if mode == "open":
                dialog_type = webview.FileDialog.OPEN
            elif mode == "save":
                dialog_type = webview.FileDialog.SAVE
        except AttributeError:
            dialog_type = webview.OPEN_DIALOG if mode == "open" else webview.SAVE_DIALOG
        return webview.windows[0].create_file_dialog(dialog_type, **kwargs)

    def get_ui_schema(self) -> Dict:
        return self._schema

    def get_adjacent_configs(self) -> List[Dict]:
        configs = load_adjacent_configs(self._web_dir)
        logging.info("get_adjacent_configs: web_dir=%s, found=%d configs", self._web_dir, len(configs))
        return configs

    def list_ports(self) -> List[Dict]:
        return self._serial.list_ports()

    def connect(self, port_name: str) -> Dict:
        ok = self._serial.connect(port_name)
        if not ok:
            return {"ok": False, "status": self.get_status(), "error": "connect_failed"}
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

    def is_connected(self) -> bool:
        return self._serial.is_connected()

    _health_failures: int = 0
    _MAX_HEALTH_FAILURES: int = 3

    def check_connection(self) -> Dict:
        """Lightweight connection health check for frontend polling.

        Only disconnects after several consecutive failures to avoid
        dropping the connection on transient serial lock contention.
        """
        connected = self._serial.is_connected()
        if not connected:
            self._health_failures = 0
            return {"connected": False, "alive": False}
        alive = self._serial.check_alive()
        if not alive:
            self._health_failures += 1
            if self._health_failures >= self._MAX_HEALTH_FAILURES:
                self._health_failures = 0
                self._serial.disconnect()
                return {"connected": False, "alive": False}
            # Not yet fatal – report still connected
            return {"connected": True, "alive": False}
        self._health_failures = 0
        return {"connected": True, "alive": True}

    def get_active_classes(self) -> List[Dict]:
        return self._serial.get_active_tabs()

    def get_main_classes(self) -> Dict:
        return self._serial.get_main_classes()

    def get_class_definitions(self) -> Dict:
        return self._serial.get_class_definitions()

    def get_connect_data(self) -> Dict:
        """Single mega-batch for connect: active + classDefs + ioDefs + main + rates."""
        return self._serial.get_connect_data()

    def apply_class_definitions(self, payload: Dict) -> Dict:
        return {"ok": self._serial.apply_class_definitions(payload)}

    def get_effects_status(self, axis: int = 0) -> Dict:
        return self._serial.get_effects_status(axis=axis)

    def get_effects_live_forces(self, axis: int = 0) -> Dict:
        return self._serial.get_effects_live_forces(axis=axis)

    def get_effects_combined(self, axis: int = 0) -> Dict:
        """Single call for monitoring: effects status + live forces."""
        return self._serial.get_effects_combined(axis=axis)

    def get_ffb_status(self) -> Dict:
        return self._serial.get_ffb_status()

    def set_main_class(self, class_id: int) -> Dict:
        return {"ok": self._serial.set_main_class(class_id)}

    def reboot(self) -> Dict:
        return {"ok": self._serial.reboot()}

    def format_flash(self) -> Dict:
        return {"ok": self._serial.format_flash()}

    def save_to_flash(self) -> Dict:
        ok = self._serial.save_to_flash()
        if ok:
            self.save_profile_from_board("Flash profile")
        return {"ok": ok}

    def get_errors(self) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "errors": []}
        reply = self._serial.request("sys", "errors")
        errors = []
        if reply:
            for line in reply.split("\n"):
                parts = line.split(":", 2)
                if len(parts) < 3:
                    continue
                errors.append({"code": parts[0], "level": parts[1], "info": parts[2]})
        return {"ok": True, "errors": errors}

    def clear_errors(self) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        self._serial.send_raw(encode_cmd("sys", "errorsclr"))
        return {"ok": True}

    def dfu_enter(self) -> Dict:
        return {"ok": self._dfu.enter_dfu_mode()}

    def dfu_select_file(self) -> Dict:
        selection = self._file_dialog(
            "open",
            allow_multiple=False,
            file_types=("Firmware (*.dfu *.hex)",),
        )
        path = self._first_path(selection)
        if not path:
            return {"ok": False, "error": "canceled"}
        return self._dfu.select_file(path)

    def dfu_upload(self, mass_erase: bool = False) -> Dict:
        return self._dfu.upload(mass_erase=mass_erase)

    def dfu_mass_erase(self) -> Dict:
        return self._dfu.mass_erase()

    def dfu_status(self) -> Dict:
        probe = self._dfu.probe_devices()
        return {
            "ok": True,
            "busy": self._dfu.busy,
            "progress": self._dfu.progress,
            "selected": self._dfu.selected_file,
            "log": self._dfu.log[-200:],
            "error": self._dfu.last_error,
            "dfu_ok": probe.get("ok"),
            "dfu_count": probe.get("count", 0),
            "dfu_error": probe.get("error"),
        }

    def save_flash_dump(self) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        dump_raw = self._serial.request("sys", "flashdump")
        if not dump_raw:
            return {"ok": False, "error": "no_data"}
        selection = self._file_dialog(
            "save",
            save_filename="dump.json",
            file_types=("JSON (*.json)",),
        )
        path = self._first_path(selection)
        if not path:
            return {"ok": False, "error": "canceled"}
        dump = {"flash": []}
        for line in dump_raw.split("\n"):
            if not line:
                break
            parts = line.split(":")
            if len(parts) < 2:
                continue
            val, addr = parts[0], parts[1]
            dump["flash"].append({"addr": addr, "val": val})
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(dump, fh, indent=2)
        except OSError:
            return {"ok": False, "error": "write_failed"}
        return {"ok": True, "count": len(dump["flash"])}

    def load_flash_dump(self) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        selection = self._file_dialog(
            "open",
            allow_multiple=False,
            file_types=("JSON (*.json)",),
        )
        path = self._first_path(selection)
        if not path:
            return {"ok": False, "error": "canceled"}
        try:
            with open(path, "r", encoding="utf-8") as fh:
                dump = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return {"ok": False, "error": "read_failed"}
        entries = dump.get("flash", []) if isinstance(dump, dict) else []
        sent = 0
        for sector in entries:
            if not isinstance(sector, dict):
                continue
            try:
                val = int(str(sector.get("val")), 0)
                addr = int(str(sector.get("addr")), 0)
            except (TypeError, ValueError):
                continue
            self._serial.send_value("sys", "flashraw", value=val, adr=addr, instance=0)
            sent += 1
        return {"ok": True, "count": sent}

    def get_joystick_rates(self) -> Dict:
        return self._serial.get_joystick_rates()

    def set_joystick_rate(self, rate_id: int) -> Dict:
        return {"ok": self._serial.set_joystick_rate(rate_id)}

    def send_serial_command(self, command: str) -> str:
        """Envia um comando serial raw e retorna a resposta"""
        if not self._serial.is_connected():
            return "Erro: Nenhum dispositivo conectado"
        try:
            cmdline = command.strip()
            if not cmdline:
                return "Erro: comando vazio"

            if "." in cmdline and cmdline.endswith(";"):
                core = cmdline[:-1]
                parts = core.split(".")
                if len(parts) >= 3:
                    cls = parts[0]
                    instance = int(parts[1]) if parts[1].isdigit() else 0
                    cmd_part = ".".join(parts[2:])
                    typechar = None
                    if "?" in cmd_part:
                        cmd_name = cmd_part.split("?", 1)[0]
                        typechar = "?"
                    elif "!" in cmd_part:
                        cmd_name = cmd_part.split("!", 1)[0]
                        typechar = "!"
                    else:
                        cmd_name = cmd_part
                    if cmd_name and typechar:
                        result = self._serial.request(cls, cmd_name, instance=instance, typechar=typechar)
                        return result if result is not None else "Sem resposta"
                self._serial.send_raw(cmdline + "\n")
                return "OK"

            parts = cmdline.split()
            if len(parts) < 2:
                return "Erro: Formato invalido. Use: classe comando [instancia]"

            cls = parts[0]
            cmd = parts[1]
            instance = int(parts[2]) if len(parts) > 2 else 0

            result = self._serial.request(cls, cmd, instance=instance)
            return result if result is not None else "Sem resposta"
        except ValueError as e:
            return f"Erro: {str(e)}"
        except Exception as e:
            return f"Erro: {str(e)}"

    def serial_request(
        self,
        cls: str,
        cmd: str,
        instance: int = 0,
        adr: Optional[int] = None,
        typechar: str = "?",
        timeout: float = 0.8,
    ) -> str:
        if not self._serial.is_connected():
            return ""
        reply = self._serial.request(cls, cmd, instance=instance, adr=adr, typechar=typechar, timeout=timeout)
        return reply or ""

    def serial_request_many(self, payload: List[Dict]) -> List[str]:
        if not self._serial.is_connected():
            return ["" for _ in payload]
        replies = self._serial.request_many(payload)
        return [item or "" for item in replies]

    def serial_set_value(
        self,
        cls: str,
        cmd: str,
        value: int,
        instance: int = 0,
        adr: Optional[int] = None,
    ) -> Dict:
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        self._serial.send_value(cls, cmd, value=value, instance=instance, adr=adr)
        return {"ok": True}

    def serial_set_many(self, payload: List[Dict]) -> Dict:
        """Batch multiple set_value calls in a single IPC round-trip."""
        if not self._serial.is_connected():
            return {"ok": False, "error": "not_connected"}
        self._serial.send_values_batch(payload)
        return {"ok": True}

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
        if not name or name == self._profiles.NONE_PROFILE:
            return {"ok": False, "error": "invalid_profile"}
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
        selection = self._file_dialog(
            "save",
            save_filename=f"{name}.json",
            file_types=("JSON (*.json)",),
        )
        path = self._first_path(selection)
        if not path:
            return {"ok": False, "error": "canceled"}
        ok = self._profiles.export_profile(name, path)
        return {"ok": ok}

    def import_profile(self) -> Dict:
        selection = self._file_dialog(
            "open",
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
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    web_dir = os.path.join(os.path.dirname(__file__), "web")
    index_path = os.path.join(web_dir, "index.html")
    api = Api()
    webview.create_window(
        "DSW Pro Wheel Configurator",
        index_path,
        js_api=api,
        
        width=1200,
        height=780,
        min_size=(1200, 620),
    )
    webview.start(debug=False)


if __name__ == "__main__":
    main()
