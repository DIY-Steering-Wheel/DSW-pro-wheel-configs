import json
import os
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import serial
import serial.tools.list_ports

from protocol import encode_cmd, encode_get, encode_set, parse_reply
from ui_registry import build_tabs_from_lsactive


OFFICIAL_VID_PID: List[Tuple[int, int]] = [(0x1209, 0xFFB0)]


@dataclass
class SerialStatus:
    connected: bool
    port: Optional[str]
    supported: bool
    fw: Optional[str]
    hw: Optional[str]
    heapfree: Optional[str]
    temp: Optional[str]


class SerialBackend:
    def __init__(self):
        self._serial: Optional[serial.Serial] = None
        self._lock = threading.Lock()
        self._reader: Optional[threading.Thread] = None
        self._running = False
        self._buffer = ""
        self._callbacks: List[Dict] = []
        self._last_port_info: Optional[Dict] = None

    def list_ports(self) -> List[Dict]:
        ports = []
        for port in serial.tools.list_ports.comports():
            vid = port.vid
            pid = port.pid
            supported = (vid, pid) in OFFICIAL_VID_PID if vid is not None and pid is not None else False
            ports.append(
                {
                    "device": port.device,
                    "name": port.name,
                    "description": port.description or "",
                    "vid": vid,
                    "pid": pid,
                    "hwid": port.hwid,
                    "supported": supported,
                }
            )
        return ports

    def connect(self, port_name: str) -> bool:
        with self._lock:
            if self._serial and self._serial.is_open:
                return True
            try:
                self._serial = serial.Serial(port=port_name, baudrate=115200, timeout=0.1)
                self._serial.dtr = True
                self._running = True
                self._reader = threading.Thread(target=self._read_loop, daemon=True)
                self._reader.start()
                self._last_port_info = {"device": port_name}
                return True
            except serial.SerialException:
                self._serial = None
                self._running = False
                return False

    def disconnect(self) -> None:
        with self._lock:
            self._running = False
            if self._serial:
                try:
                    self._serial.close()
                finally:
                    self._serial = None

    def is_connected(self) -> bool:
        return self._serial is not None and self._serial.is_open

    def send_raw(self, payload: str) -> None:
        if not self.is_connected():
            return
        with self._lock:
            self._serial.write(payload.encode("utf-8"))

    def request(self, cls: str, cmd: str, instance: int = 0, adr: Optional[int] = None, typechar: str = "?") -> Optional[str]:
        if not self.is_connected():
            return None

        result = {"value": None}
        evt = threading.Event()

        def handler(reply: str) -> None:
            result["value"] = reply
            evt.set()

        cb = self._register_callback(cls, cmd, instance, adr, typechar, handler)
        if typechar == "?":
            self.send_raw(encode_get(cls, cmd, instance=instance, address=adr))
        elif typechar == "":
            self.send_raw(encode_cmd(cls, cmd, instance=instance, address=adr))
        else:
            self.send_raw(encode_get(cls, cmd, instance=instance, address=adr))

        evt.wait(1.5)
        if not evt.is_set() and cb in self._callbacks:
            self._callbacks.remove(cb)
        return result["value"]

    def send_value(self, cls: str, cmd: str, value: int, instance: int = 0, adr: Optional[int] = None) -> None:
        if not self.is_connected():
            return
        self.send_raw(encode_set(cls, cmd, value=value, instance=instance, address=adr))

    def get_status(self) -> SerialStatus:
        if not self.is_connected():
            return SerialStatus(False, None, False, None, None, None, None)
        fw = self.request("sys", "swver")
        hw = self.request("sys", "hwtype")
        heapfree = self.request("sys", "heapfree")
        temp = self.request("sys", "temp")
        port = self._serial.port if self._serial else None
        supported = False
        if port:
            for entry in self.list_ports():
                if entry["device"] == port:
                    supported = entry["supported"]
                    break
        return SerialStatus(True, port, supported, fw, hw, heapfree, temp)

    def get_active_tabs(self) -> List[Dict]:
        reply = self.request("sys", "lsactive")
        if not reply:
            return []
        return build_tabs_from_lsactive(reply)

    def get_main_classes(self) -> Dict:
        if not self.is_connected():
            return {"current": None, "classes": []}
        main_id = self.request("main", "id")
        lsmain = self.request("sys", "lsmain")
        classes = []
        if lsmain:
            for line in lsmain.split("\n"):
                if not line:
                    continue
                parts = line.split(":", 2)
                if len(parts) < 3:
                    continue
                class_id, creatable, name = parts
                try:
                    class_id = int(class_id)
                except ValueError:
                    continue
                classes.append(
                    {
                        "id": class_id,
                        "name": name,
                        "creatable": creatable != "0",
                    }
                )
        try:
            current = int(main_id) if main_id is not None else None
        except ValueError:
            current = None
        return {"current": current, "classes": classes}

    def set_main_class(self, class_id: int) -> bool:
        if not self.is_connected():
            return False
        self.send_value("sys", "main", value=class_id)
        self.send_raw(encode_cmd("sys", "reboot"))
        return True

    def reboot(self) -> bool:
        if not self.is_connected():
            return False
        self.send_raw(encode_cmd("sys", "reboot"))
        return True

    def format_flash(self) -> bool:
        if not self.is_connected():
            return False
        self.send_value("sys", "format", value=1)
        self.send_raw(encode_cmd("sys", "reboot"))
        return True

    def save_to_flash(self) -> bool:
        if not self.is_connected():
            return False
        reply = self.request("sys", "save")
        return reply is not None

    def set_class_active(self, class_id: int, enabled: bool) -> bool:
        if not self.is_connected():
            return False
        # TODO: confirm firmware commands for enabling/disabling classes.
        return False

    def _register_callback(
        self,
        cls: str,
        cmd: str,
        instance: int,
        address: Optional[int],
        typechar: str,
        callback,
    ) -> Dict:
        entry = {
            "cls": cls,
            "cmd": cmd,
            "instance": instance,
            "address": address,
            "typechar": typechar,
            "callback": callback,
        }
        self._callbacks.append(entry)
        return entry

    def _dispatch(self, parsed) -> None:
        to_remove = []
        for cb in self._callbacks:
            if cb["cls"] != parsed.cls:
                continue
            if cb["cmd"] != parsed.cmd:
                continue
            if cb["instance"] not in (parsed.instance, 0xFF):
                continue
            if cb["typechar"] not in (parsed.typechar, None):
                continue
            if cb["address"] is not None and cb["address"] != parsed.address:
                continue
            cb["callback"](parsed.reply)
            to_remove.append(cb)
        for cb in to_remove:
            if cb in self._callbacks:
                self._callbacks.remove(cb)

    def _read_loop(self) -> None:
        while self._running and self._serial:
            try:
                chunk = self._serial.read(512)
            except serial.SerialException:
                self.disconnect()
                return
            if not chunk:
                time.sleep(0.01)
                continue
            try:
                self._buffer += chunk.decode("utf-8", errors="ignore")
            except UnicodeDecodeError:
                continue

            while True:
                end = self._buffer.find("]")
                if end == -1:
                    break
                start = self._buffer.find("[")
                if start == -1 or start > end:
                    self._buffer = self._buffer[end + 1 :]
                    continue
                frame = self._buffer[start : end + 1]
                self._buffer = self._buffer[end + 1 :]
                parsed = parse_reply(frame)
                if parsed:
                    self._dispatch(parsed)


class ProfileStore:
    RELEASE = 2

    def __init__(self):
        self._profiles_path = os.path.join(os.getcwd(), "profiles.json")
        self._profile_setup_path = os.path.join("OLD ui", "res", "profile.cfg")
        self._profiles = self._load_or_create()
        self._profile_setup = self._load_profile_setup()

    def _load_or_create(self) -> Dict:
        if os.path.exists(self._profiles_path):
            with open(self._profiles_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        else:
            data = {
                "release": self.RELEASE,
                "global": {"current_profile": "None"},
                "profiles": [{"name": "None", "data": []}],
            }
            self._write(data)
        if data.get("release", 0) < self.RELEASE:
            data["release"] = self.RELEASE
            self._write(data)
        return data

    def _load_profile_setup(self) -> Dict:
        if os.path.exists(self._profile_setup_path):
            with open(self._profile_setup_path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        return {"release": 0, "callOrder": []}

    def _write(self, data: Dict) -> None:
        with open(self._profiles_path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)

    def list_profiles(self) -> List[str]:
        return [p["name"] for p in self._profiles.get("profiles", [])]

    def get_current_profile(self) -> str:
        return self._profiles.get("global", {}).get("current_profile", "None")

    def select_profile(self, name: str) -> bool:
        if name not in self.list_profiles():
            return False
        self._profiles["global"]["current_profile"] = name
        self._write(self._profiles)
        return True

    def create_profile(self, name: str) -> bool:
        if not name or name in self.list_profiles():
            return False
        self._profiles["profiles"].append({"name": name, "data": []})
        self._write(self._profiles)
        return True

    def rename_profile(self, old: str, new: str) -> bool:
        if old == "None" or not new or new in self.list_profiles():
            return False
        for entry in self._profiles["profiles"]:
            if entry["name"] == old:
                entry["name"] = new
                if self.get_current_profile() == old:
                    self._profiles["global"]["current_profile"] = new
                self._write(self._profiles)
                return True
        return False

    def delete_profile(self, name: str) -> bool:
        if name == "None":
            return False
        self._profiles["profiles"] = [p for p in self._profiles["profiles"] if p["name"] != name]
        if self.get_current_profile() == name:
            self._profiles["global"]["current_profile"] = "None"
        self._write(self._profiles)
        return True

    def save_profile_data(self, name: str, data: List[Dict]) -> bool:
        for entry in self._profiles["profiles"]:
            if entry["name"] == name:
                entry["data"] = data
                self._write(self._profiles)
                return True
        return False

    def get_profile_data(self, name: str) -> List[Dict]:
        for entry in self._profiles["profiles"]:
            if entry["name"] == name:
                return entry.get("data", [])
        return []

    def get_call_order(self) -> List[Dict]:
        return self._profile_setup.get("callOrder", [])

    def export_profile(self, name: str, path: str) -> bool:
        if not name:
            return False
        for entry in self._profiles["profiles"]:
            if entry["name"] == name:
                payload = {"release": self.RELEASE, "profile": {"name": name, "data": entry.get("data", [])}}
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(payload, fh, indent=2)
                return True
        return False

    def import_profile(self, path: str) -> Optional[str]:
        if not path or not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)

        profiles_to_add: List[Dict] = []
        if isinstance(payload, dict) and isinstance(payload.get("profile"), dict):
            profiles_to_add = [payload["profile"]]
        elif isinstance(payload, dict) and "name" in payload and "data" in payload:
            profiles_to_add = [{"name": payload.get("name"), "data": payload.get("data", [])}]
        elif isinstance(payload, dict) and isinstance(payload.get("profiles"), list):
            profiles_to_add = payload["profiles"]

        if not profiles_to_add:
            return None

        imported_name = None
        for entry in profiles_to_add:
            if not isinstance(entry, dict):
                continue
            name = entry.get("name") or os.path.splitext(os.path.basename(path))[0]
            if not name or name == "None":
                continue
            data = entry.get("data", [])
            name = self._unique_import_name(name)
            self._profiles["profiles"].append({"name": name, "data": data})
            imported_name = name

        if imported_name:
            self._write(self._profiles)
        return imported_name

    def _unique_import_name(self, base: str) -> str:
        existing = set(self.list_profiles())
        if base not in existing:
            return base
        suffix = " (importado)"
        candidate = f"{base}{suffix}"
        if candidate not in existing:
            return candidate
        idx = 2
        while True:
            candidate = f"{base}{suffix} {idx}"
            if candidate not in existing:
                return candidate
            idx += 1
