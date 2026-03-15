import re
from dataclasses import dataclass
from typing import Optional


CMD_REGEX = re.compile(
    r"\[(\w+)\.(?:(\d+)\.)?(\w+)([?!=]?)(?:(\d+))?(?:\?(\d+))?\|(.+)\]",
    re.DOTALL,
)


@dataclass
class ParsedReply:
    cls: str
    instance: int
    cmd: str
    typechar: str
    value: Optional[int]
    address: Optional[int]
    reply: str


def encode_get(cls: str, cmd: str, instance: int = 0, address: Optional[int] = None) -> str:
    if address is None:
        return f"{cls}.{instance}.{cmd}?;"
    return f"{cls}.{instance}.{cmd}?{address};"


def encode_cmd(cls: str, cmd: str, instance: int = 0, address: Optional[int] = None) -> str:
    if address is None:
        return f"{cls}.{instance}.{cmd};"
    return f"{cls}.{instance}.{cmd}?{address};"


def encode_set(cls: str, cmd: str, value: int, instance: int = 0, address: Optional[int] = None) -> str:
    if address is None:
        return f"{cls}.{instance}.{cmd}={value};"
    return f"{cls}.{instance}.{cmd}={value}?{address};"


def parse_reply(frame: str) -> Optional[ParsedReply]:
    match = CMD_REGEX.search(frame)
    if not match:
        return None
    cls = match.group(1)
    instance = int(match.group(2)) if match.group(2) else 0
    cmd = match.group(3)
    typechar = match.group(4) or ""
    value = int(match.group(5)) if match.group(5) else None
    address = int(match.group(6)) if match.group(6) else None
    reply = str(match.group(7))
    return ParsedReply(cls, instance, cmd, typechar, value, address, reply)
