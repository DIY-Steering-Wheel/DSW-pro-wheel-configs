import json
import os
import threading
import time
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import serial
import serial.tools.list_ports

from protocol import encode_cmd, encode_get, encode_set, parse_reply
from ui_registry import build_tabs_from_lsactive


OFFICIAL_VID_PID: List[Tuple[int, int]] = [(0x1209, 0xFFB0)]
SERIAL_LOG = logging.getLogger("dsw.serial")


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
        self._request_lock = threading.Lock()
        self._disconnect_event = threading.Event()
        self._reader: Optional[threading.Thread] = None
        self._running = False
        self._buffer = bytearray()
        self._callbacks: List[Dict] = []
        self._last_port_info: Optional[Dict] = None
        self._backoff_until: float = 0.0

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
            # Ensure _request_lock is free before opening a new session.
            # A stale lock from a timed-out previous request can block all
            # new requests after reconnection.
            acquired = self._request_lock.acquire(timeout=6.0)
            if acquired:
                self._request_lock.release()
            else:
                SERIAL_LOG.warning("CONNECT: _request_lock was stuck, resetting")
                self._request_lock = threading.Lock()
            self._disconnect_event.clear()
            self._callbacks.clear()
            self._buffer = bytearray()
            self._backoff_until = 0.0
            try:
                self._serial = serial.Serial(port=port_name, baudrate=115200, timeout=0.05)
                self._serial.dtr = True
                self._running = True
                self._reader = threading.Thread(target=self._read_loop, daemon=True)
                self._reader.start()
                self._last_port_info = {"device": port_name}
                SERIAL_LOG.info("CONNECT %s", port_name)
                return True
            except serial.SerialException:
                self._serial = None
                self._running = False
                SERIAL_LOG.error("CONNECT_FAIL %s", port_name)
                return False

    def disconnect(self) -> None:
        with self._lock:
            self._running = False
            # Signal any waiting requests to unblock immediately
            self._disconnect_event.set()
            if self._serial:
                port = self._serial.port
                try:
                    self._serial.close()
                finally:
                    self._serial = None
                    self._callbacks.clear()
                    self._buffer = bytearray()
                    SERIAL_LOG.info("DISCONNECT %s", port)

    def is_connected(self) -> bool:
        return self._serial is not None and self._serial.is_open

    def check_alive(self) -> bool:
        """Quick health check - returns True if board appears connected.

        If the request lock is held by another operation we treat that as
        proof that the board is still communicating and return True.
        Bypasses backoff so it can probe and reset it on success.
        """
        if not self.is_connected():
            return False
        # Fast path: if another request is in progress, serial is active.
        if not self._request_lock.acquire(timeout=0.3):
            return True
        self._request_lock.release()
        # Temporarily disable backoff so the probe goes through
        saved_backoff = self._backoff_until
        self._backoff_until = 0.0
        reply = self.request("main", "id", timeout=1.0)
        if reply is not None:
            # Board responded — clear backoff
            self._backoff_until = 0.0
            return True
        else:
            # Restore (or extend) backoff
            self._backoff_until = max(saved_backoff, time.monotonic() + 2.0)
            return False

    def send_raw(self, payload: str) -> None:
        if not self.is_connected():
            return
        data = payload.encode("utf-8")
        with self._lock:
            self._serial.write(data)

    def request(
        self,
        cls: str,
        cmd: str,
        instance: int = 0,
        adr: Optional[int] = None,
        typechar: str = "?",
        timeout: float = 0.8,
    ) -> Optional[str]:
        if not self.is_connected():
            return None

        # Skip if board is in backoff cooldown
        if time.monotonic() < self._backoff_until:
            return None

        lock_timeout = min(timeout, 0.5)
        if not self._request_lock.acquire(timeout=lock_timeout):
            SERIAL_LOG.error("REQ_LOCK_TIMEOUT %s.%s", cls, cmd)
            return None

        # Abort early if we disconnected while waiting for the lock
        if self._disconnect_event.is_set() or not self.is_connected():
            self._request_lock.release()
            return None

        result = {"value": None}
        evt = threading.Event()

        typechar = typechar or ""

        def handler(reply: str) -> None:
            result["value"] = reply
            evt.set()

        cb = self._register_callback(cls, cmd, instance, adr, typechar, handler)
        if adr is None:
            payload = f"{cls}.{instance}.{cmd}{typechar};"
        else:
            payload = f"{cls}.{instance}.{cmd}{typechar}{adr};"
        self.send_raw(payload)

        try:
            # Wait for reply, but also unblock on disconnect
            deadline = time.monotonic() + timeout
            while not evt.is_set() and not self._disconnect_event.is_set():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                evt.wait(min(remaining, 0.1))
            if not evt.is_set() and cb in self._callbacks:
                self._callbacks.remove(cb)
                if not self._disconnect_event.is_set():
                    SERIAL_LOG.error("TIMEOUT %s.%s", cls, cmd)
                    self._backoff_until = time.monotonic() + 2.0
            else:
                self._backoff_until = 0.0
            return result["value"]
        finally:
            self._request_lock.release()

    def request_many(self, requests: List[Dict], timeout: float = 1.2) -> List[Optional[str]]:
        if not self.is_connected():
            return [None for _ in requests]
        if not requests:
            return []

        # Skip if board is in backoff cooldown
        if time.monotonic() < self._backoff_until:
            return [None for _ in requests]

        lock_timeout = min(timeout, 0.5)
        if not self._request_lock.acquire(timeout=lock_timeout):
            SERIAL_LOG.error("REQ_MANY_LOCK_TIMEOUT")
            return [None for _ in requests]

        if self._disconnect_event.is_set() or not self.is_connected():
            self._request_lock.release()
            return [None for _ in requests]

        results: List[Optional[str]] = [None for _ in requests]
        events: List[threading.Event] = [threading.Event() for _ in requests]
        callbacks: List[Dict] = []
        payload_parts: List[str] = []

        # Use a shared event that fires whenever any individual reply arrives
        shared_evt = threading.Event()

        def _make_handler(idx: int):
            def handler(reply: str) -> None:
                results[idx] = reply
                events[idx].set()
                shared_evt.set()
            return handler

        for idx, req in enumerate(requests):
            cls = req.get("cls")
            cmd = req.get("cmd")
            instance = int(req.get("instance", 0) or 0)
            adr = req.get("adr", None)
            typechar = req.get("typechar", "?") or ""
            if cls is None or cmd is None:
                events[idx].set()
                continue
            cb = self._register_callback(cls, cmd, instance, adr, typechar, _make_handler(idx))
            callbacks.append(cb)
            if adr is None:
                payload_parts.append(f"{cls}.{instance}.{cmd}{typechar};")
            else:
                payload_parts.append(f"{cls}.{instance}.{cmd}{typechar}{adr};")

        if payload_parts:
            self.send_raw("".join(payload_parts))

        try:
            deadline = time.monotonic() + timeout
            while not all(evt.is_set() for evt in events) and not self._disconnect_event.is_set():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                shared_evt.clear()
                shared_evt.wait(min(remaining, 0.1))
        finally:
            for cb in callbacks:
                if cb in self._callbacks:
                    self._callbacks.remove(cb)
            self._request_lock.release()

        replied = sum(1 for e in events if e.is_set())
        if replied == 0 and len(requests) > 0:
            self._backoff_until = time.monotonic() + 2.0
            SERIAL_LOG.warning("Board unresponsive (%d cmds), backoff 2s", len(requests))
        elif replied == len(events):
            self._backoff_until = 0.0

        return results

    def send_value(self, cls: str, cmd: str, value: int, instance: int = 0, adr: Optional[int] = None) -> None:
        if not self.is_connected():
            return
        self.send_raw(encode_set(cls, cmd, value=value, instance=instance, address=adr))

    def send_values_batch(self, items: List[Dict]) -> None:
        """Send multiple set commands in a single serial write for efficiency."""
        if not self.is_connected() or not items:
            return
        payload = "".join(
            encode_set(
                item["cls"],
                item["cmd"],
                value=int(item["value"]),
                instance=int(item.get("instance", 0) or 0),
                address=item.get("adr"),
            )
            for item in items
            if item.get("cls") and item.get("cmd") and item.get("value") is not None
        )
        if payload:
            self.send_raw(payload)

    def get_status(self) -> SerialStatus:
        if not self.is_connected():
            return SerialStatus(False, None, False, None, None, None, None)
        replies = self.request_many([
            {"cls": "sys", "cmd": "swver", "typechar": "?"},
            {"cls": "sys", "cmd": "hwtype", "typechar": "?"},
            {"cls": "sys", "cmd": "heapfree", "typechar": "?"},
            {"cls": "sys", "cmd": "temp", "typechar": "?"},
        ])
        fw, hw, heapfree, temp = replies
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
        SERIAL_LOG.info("lsactive raw: %r", reply)
        if not reply:
            return []
        tabs = build_tabs_from_lsactive(reply)
        SERIAL_LOG.info("lsactive parsed %d tabs: %s", len(tabs), [(t.get("clsname"), t.get("id")) for t in tabs])
        return tabs

    def get_main_classes(self) -> Dict:
        if not self.is_connected():
            return {"current": None, "classes": []}
        replies = self.request_many([
            {"cls": "main", "cmd": "id", "typechar": "?"},
            {"cls": "sys", "cmd": "lsmain", "typechar": "?"},
        ])
        main_id, lsmain = replies
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

    @staticmethod
    def _parse_class_list(reply: Optional[str]) -> List[Dict]:
        if not reply:
            return []
        classes = []
        for line in reply.split("\n"):
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
            name = (name or "").strip()
            classes.append(
                {
                    "id": class_id,
                    "name": name,
                    "creatable": creatable != "0",
                }
            )
        return classes

    @staticmethod
    def _parse_shifter_modes(reply: Optional[str]) -> List[Dict]:
        if not reply:
            return []
        modes = []
        for line in reply.split("\n"):
            if not line:
                continue
            parts = line.split(":", 1)
            if len(parts) < 2:
                continue
            name, meta = parts
            meta_parts = meta.split(",")
            if not meta_parts:
                continue
            try:
                mode_id = int(meta_parts[0])
            except ValueError:
                continue
            modes.append({"id": mode_id, "name": name})
        return modes

    def get_class_definitions(self, axis: int = 0) -> Dict:
        if not self.is_connected():
            return {
                "driver": {"current": None, "classes": []},
                "encoder": {"current": None, "classes": []},
                "shifter": {"current": None, "modes": []},
            }

        replies = self.request_many([
            {"cls": "axis", "cmd": "drvtype", "instance": axis, "typechar": "!"},
            {"cls": "axis", "cmd": "drvtype", "instance": axis, "typechar": "?"},
            {"cls": "axis", "cmd": "enctype", "instance": axis, "typechar": "!"},
            {"cls": "axis", "cmd": "enctype", "instance": axis, "typechar": "?"},
            {"cls": "shifter", "cmd": "mode", "instance": 0, "typechar": "!"},
            {"cls": "shifter", "cmd": "mode", "instance": 0, "typechar": "?"},
        ])
        driver_list, driver_current, encoder_list, encoder_current, shifter_list, shifter_current = replies

        def _to_int(value: Optional[str]) -> Optional[int]:
            if value is None:
                return None
            try:
                return int(value)
            except ValueError:
                return None

        def _resolve_current(raw: Optional[str], classes: List[Dict]) -> Optional[int]:
            current = _to_int(raw)
            if current is not None:
                return current
            if not raw or not classes:
                return None
            raw_norm = str(raw).strip().lower()
            for entry in classes:
                name = str(entry.get("name") or "").strip().lower()
                if not name:
                    continue
                if raw_norm == name:
                    return entry.get("id")
            for entry in classes:
                name = str(entry.get("name") or "").strip().lower()
                if not name:
                    continue
                if raw_norm in name or name in raw_norm:
                    return entry.get("id")
            return None

        driver_classes = self._parse_class_list(driver_list)
        encoder_classes = self._parse_class_list(encoder_list)

        return {
            "driver": {
                "current": _resolve_current(driver_current, driver_classes),
                "classes": driver_classes,
            },
            "encoder": {
                "current": _resolve_current(encoder_current, encoder_classes),
                "classes": encoder_classes,
            },
            "shifter": {
                "current": _to_int(shifter_current),
                "modes": self._parse_shifter_modes(shifter_list),
            },
        }

    def get_effects_status(self, axis: int = 0) -> Dict:
        if not self.is_connected():
            return {"ok": False, "effects": [], "active_mask": 0}
        replies = self.request_many([
            {"cls": "fx", "cmd": "effectsDetails", "adr": axis, "typechar": "?"},
            {"cls": "fx", "cmd": "effects", "typechar": "?"},
        ], timeout=1.5)
        details, active = replies
        effects: List[Dict] = []
        if details:
            try:
                effects = json.loads("[" + details + "]")
            except json.JSONDecodeError:
                effects = []
        try:
            active_mask = int(active) if active is not None else 0
        except ValueError:
            active_mask = 0
        return {"ok": True, "effects": effects, "active_mask": active_mask}

    def get_effects_live_forces(self, axis: int = 0) -> Dict:
        if not self.is_connected():
            return {"ok": False, "forces": [], "effects": []}
        data = self.request("fx", "effectsForces", adr=axis, typechar="?", timeout=1.5)
        forces: List[int] = []
        effects: List[int] = []
        if data:
            for line in data.split("\n"):
                if not line:
                    continue
                parts = line.split(":")
                if len(parts) < 2:
                    continue
                try:
                    forces.append(int(parts[0]))
                    effects.append(int(parts[1]))
                except ValueError:
                    continue
        return {"ok": True, "forces": forces, "effects": effects}

    def get_effects_combined(self, axis: int = 0) -> Dict:
        """Fetch effects status + live forces in a single lock acquisition."""
        if not self.is_connected():
            return {"ok": False, "effects": [], "active_mask": 0, "forces": [], "force_effects": []}
        replies = self.request_many([
            {"cls": "fx", "cmd": "effectsDetails", "adr": axis, "typechar": "?"},
            {"cls": "fx", "cmd": "effects", "typechar": "?"},
            {"cls": "fx", "cmd": "effectsForces", "adr": axis, "typechar": "?"},
        ], timeout=1.5)
        details, active, forces_data = replies
        effects: List[Dict] = []
        if details:
            try:
                effects = json.loads("[" + details + "]")
            except json.JSONDecodeError:
                effects = []
        try:
            active_mask = int(active) if active is not None else 0
        except ValueError:
            active_mask = 0
        forces: List[int] = []
        force_effects: List[int] = []
        if forces_data:
            for line in forces_data.split("\n"):
                if not line:
                    continue
                parts = line.split(":")
                if len(parts) < 2:
                    continue
                try:
                    forces.append(int(parts[0]))
                    force_effects.append(int(parts[1]))
                except ValueError:
                    continue
        return {"ok": True, "effects": effects, "active_mask": active_mask, "forces": forces, "force_effects": force_effects}

    def get_ffb_status(self) -> Dict:
        if not self.is_connected():
            return {"ok": False, "active": False, "rate": 0, "cfrate": 0}
        replies = self.request_many([
            {"cls": "main", "cmd": "hidrate", "typechar": "?"},
            {"cls": "main", "cmd": "cfrate", "typechar": "?"},
            {"cls": "main", "cmd": "ffbactive", "typechar": "?"},
        ], timeout=1.5)
        rate, cfrate, active = replies
        try:
            rate_val = int(rate) if rate is not None else 0
        except ValueError:
            rate_val = 0
        try:
            cfrate_val = int(cfrate) if cfrate is not None else 0
        except ValueError:
            cfrate_val = 0
        try:
            active_val = int(active) if active is not None else 0
        except ValueError:
            active_val = 0
        return {"ok": True, "active": active_val > 0, "rate": rate_val, "cfrate": cfrate_val}

    @staticmethod
    def _parse_modes_list(reply: Optional[str]) -> List[Dict]:
        if not reply:
            return []
        raw = reply.replace("\n", ",")
        parts = [p for p in raw.split(",") if p]
        modes = []
        for item in parts:
            chunk = item.split(":")
            if len(chunk) < 2:
                continue
            name = chunk[0].strip()
            try:
                mode_id = int(chunk[1])
            except ValueError:
                continue
            modes.append({"id": mode_id, "name": name})
        return modes

    def get_joystick_rates(self) -> Dict:
        if not self.is_connected():
            return {"current": None, "modes": []}
        replies = self.request_many([
            {"cls": "main", "cmd": "hidsendspd", "typechar": "!"},
            {"cls": "main", "cmd": "hidsendspd", "typechar": "?"},
        ])
        modes_reply, current_reply = replies
        try:
            current = int(current_reply) if current_reply is not None else None
        except ValueError:
            current = None
        return {"current": current, "modes": self._parse_modes_list(modes_reply)}

    def get_connect_data(self, axis: int = 0) -> Dict:
        """Single mega-batch: active_classes + class_definitions + io_definitions + main_classes + joystick_rates."""
        if not self.is_connected():
            return {
                "active_classes": [],
                "class_definitions": {
                    "driver": {"current": None, "classes": []},
                    "encoder": {"current": None, "classes": []},
                    "shifter": {"current": None, "modes": []},
                },
                "io_definitions": {
                    "lsain": None, "aintypes": None,
                    "lsbtn": None, "btntypes": None,
                },
                "main_classes": {"current": None, "classes": []},
                "joystick_rates": {"current": None, "modes": []},
            }

        replies = self.request_many([
            # 0: active_classes
            {"cls": "sys", "cmd": "lsactive", "typechar": "?"},
            # 1-6: class_definitions
            {"cls": "axis", "cmd": "drvtype", "instance": axis, "typechar": "!"},
            {"cls": "axis", "cmd": "drvtype", "instance": axis, "typechar": "?"},
            {"cls": "axis", "cmd": "enctype", "instance": axis, "typechar": "!"},
            {"cls": "axis", "cmd": "enctype", "instance": axis, "typechar": "?"},
            {"cls": "shifter", "cmd": "mode", "instance": 0, "typechar": "!"},
            {"cls": "shifter", "cmd": "mode", "instance": 0, "typechar": "?"},
            # 7-10: io_definitions
            {"cls": "main", "cmd": "lsain", "instance": 0, "typechar": "?"},
            {"cls": "main", "cmd": "aintypes", "instance": 0, "typechar": "?"},
            {"cls": "main", "cmd": "lsbtn", "instance": 0, "typechar": "?"},
            {"cls": "main", "cmd": "btntypes", "instance": 0, "typechar": "?"},
            # 11-12: main_classes
            {"cls": "main", "cmd": "id", "typechar": "?"},
            {"cls": "sys", "cmd": "lsmain", "typechar": "?"},
            # 13-14: joystick_rates
            {"cls": "main", "cmd": "hidsendspd", "typechar": "!"},
            {"cls": "main", "cmd": "hidsendspd", "typechar": "?"},
        ], timeout=2.0)

        (lsactive_raw,
         driver_list, driver_current, encoder_list, encoder_current, shifter_list, shifter_current,
         lsain, aintypes, lsbtn, btntypes,
         main_id, lsmain,
         rate_modes_reply, rate_current_reply) = replies

        # --- active_classes ---
        SERIAL_LOG.info("lsactive raw: %r", lsactive_raw)
        active_classes = build_tabs_from_lsactive(lsactive_raw) if lsactive_raw else []
        SERIAL_LOG.info("lsactive parsed %d tabs", len(active_classes))

        # --- class_definitions ---
        def _to_int(value):
            if value is None:
                return None
            try:
                return int(value)
            except ValueError:
                return None

        def _resolve_current(raw, classes):
            current = _to_int(raw)
            if current is not None:
                return current
            if not raw or not classes:
                return None
            raw_norm = str(raw).strip().lower()
            for entry in classes:
                name = str(entry.get("name") or "").strip().lower()
                if name and raw_norm == name:
                    return entry.get("id")
            for entry in classes:
                name = str(entry.get("name") or "").strip().lower()
                if name and (raw_norm in name or name in raw_norm):
                    return entry.get("id")
            return None

        driver_classes = self._parse_class_list(driver_list)
        encoder_classes = self._parse_class_list(encoder_list)
        class_definitions = {
            "driver": {"current": _resolve_current(driver_current, driver_classes), "classes": driver_classes},
            "encoder": {"current": _resolve_current(encoder_current, encoder_classes), "classes": encoder_classes},
            "shifter": {"current": _to_int(shifter_current), "modes": self._parse_shifter_modes(shifter_list)},
        }

        # --- io_definitions (raw strings, parsed in JS) ---
        io_definitions = {
            "lsain": lsain, "aintypes": aintypes,
            "lsbtn": lsbtn, "btntypes": btntypes,
        }

        # --- main_classes ---
        classes = []
        if lsmain:
            for line in lsmain.split("\n"):
                if not line:
                    continue
                parts = line.split(":", 2)
                if len(parts) < 3:
                    continue
                class_id_str, creatable, name = parts
                try:
                    cid = int(class_id_str)
                except ValueError:
                    continue
                classes.append({"id": cid, "name": name, "creatable": creatable != "0"})
        try:
            main_current = int(main_id) if main_id is not None else None
        except ValueError:
            main_current = None
        main_classes = {"current": main_current, "classes": classes}

        # --- joystick_rates ---
        try:
            rate_current = int(rate_current_reply) if rate_current_reply is not None else None
        except ValueError:
            rate_current = None
        joystick_rates = {"current": rate_current, "modes": self._parse_modes_list(rate_modes_reply)}

        return {
            "active_classes": active_classes,
            "class_definitions": class_definitions,
            "io_definitions": io_definitions,
            "main_classes": main_classes,
            "joystick_rates": joystick_rates,
        }

    def set_joystick_rate(self, rate_id: int) -> bool:
        if not self.is_connected():
            return False
        self.send_value("main", "hidsendspd", value=int(rate_id), instance=0)
        return True

    def apply_class_definitions(self, payload: Dict, axis: int = 0) -> bool:
        if not self.is_connected():
            return False
        driver_id = payload.get("driver")
        encoder_id = payload.get("encoder")
        shifter_mode = payload.get("shifter")

        items = []
        if driver_id is not None:
            items.append({"cls": "axis", "cmd": "drvtype", "value": int(driver_id), "instance": axis})
        if encoder_id is not None:
            items.append({"cls": "axis", "cmd": "enctype", "value": int(encoder_id), "instance": axis})
        if shifter_mode is not None:
            items.append({"cls": "shifter", "cmd": "mode", "value": int(shifter_mode), "instance": 0})
        if items:
            self.send_values_batch(items)
        return True

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
        # Save is user-initiated and must always go through — reset backoff
        self._backoff_until = 0.0
        # Wait briefly for any in-flight requests to finish
        time.sleep(0.15)
        reply = self.request("sys", "save", timeout=5.0)
        if reply is None:
            SERIAL_LOG.warning("SAVE_TO_FLASH first attempt failed, retrying...")
            self._backoff_until = 0.0
            time.sleep(0.5)
            reply = self.request("sys", "save", timeout=5.0)
        SERIAL_LOG.info("SAVE_TO_FLASH result: %s", reply)
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
        cls_cmd = (parsed.cls, parsed.cmd)
        to_remove = []
        for cb in self._callbacks:
            if (cb["cls"], cb["cmd"]) != cls_cmd:
                continue
            if cb["instance"] not in (parsed.instance, 0xFF):
                continue
            tc = cb["typechar"]
            if tc is not None and tc != parsed.typechar:
                continue
            if cb["address"] is not None and cb["address"] != parsed.address:
                continue
            cb["callback"](parsed.reply)
            to_remove.append(cb)
        if to_remove:
            cbs = self._callbacks
            for cb in to_remove:
                try:
                    cbs.remove(cb)
                except ValueError:
                    pass

    def _read_loop(self) -> None:
        buf = self._buffer
        while self._running and self._serial:
            try:
                waiting = self._serial.in_waiting
                if waiting > 0:
                    chunk = self._serial.read(waiting)
                else:
                    chunk = self._serial.read(1)
            except serial.SerialException:
                SERIAL_LOG.error("READ_ERROR")
                self.disconnect()
                return
            if not chunk:
                continue
            buf.extend(chunk)

            while True:
                end = buf.find(b"]")
                if end == -1:
                    break
                start = buf.find(b"[")
                if start == -1 or start > end:
                    del buf[:end + 1]
                    continue
                frame = buf[start:end + 1].decode("utf-8", errors="ignore")
                del buf[:end + 1]
                parsed = parse_reply(frame)
                if parsed:
                    self._dispatch(parsed)


class ProfileStore:
    RELEASE = 2
    FLASH_PROFILE = "Flash profile"
    NONE_PROFILE = "None"

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
                "global": {"current_profile": self.NONE_PROFILE},
                "profiles": [
                    {"name": self.NONE_PROFILE, "data": []},
                    {"name": self.FLASH_PROFILE, "data": []},
                ],
            }
            self._write(data)
        names = {p.get("name") for p in data.get("profiles", []) if isinstance(p, dict)}
        if self.NONE_PROFILE not in names:
            data["profiles"].append({"name": self.NONE_PROFILE, "data": []})
        if self.FLASH_PROFILE not in names:
            data["profiles"].append({"name": self.FLASH_PROFILE, "data": []})
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
        return [p["name"] for p in self._profiles.get("profiles", []) if isinstance(p, dict) and p.get("name")]

    def get_current_profile(self) -> str:
        return self._profiles.get("global", {}).get("current_profile", self.NONE_PROFILE)

    def select_profile(self, name: str) -> bool:
        if name not in self.list_profiles():
            return False
        self._profiles["global"]["current_profile"] = name
        self._write(self._profiles)
        return True

    def create_profile(self, name: str) -> bool:
        if not name or name in self.list_profiles():
            return False
        if name in (self.NONE_PROFILE, self.FLASH_PROFILE):
            return False
        self._profiles["profiles"].append({"name": name, "data": []})
        self._write(self._profiles)
        return True

    def rename_profile(self, old: str, new: str) -> bool:
        if old in (self.NONE_PROFILE, self.FLASH_PROFILE) or not new or new in self.list_profiles():
            return False
        if new in (self.NONE_PROFILE, self.FLASH_PROFILE):
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
        if name in (self.NONE_PROFILE, self.FLASH_PROFILE):
            return False
        self._profiles["profiles"] = [p for p in self._profiles["profiles"] if p["name"] != name]
        if self.get_current_profile() == name:
            self._profiles["global"]["current_profile"] = self.NONE_PROFILE
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
