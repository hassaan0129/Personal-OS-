#!/usr/bin/env python3
"""Block clearly destructive shell commands and likely secret reads."""
from __future__ import annotations
import json, re, sys

try:
    payload = json.load(sys.stdin)
except Exception:
    payload = {}

command = str((payload.get("tool_input") or {}).get("command") or "")
normalized = " ".join(command.lower().split())

BLOCKS = [
    (r"(?:^|[;&|]\s*)rm\s+-rf\s+(?:/|~|\$home)(?:\s|$)", "Recursive deletion of a root or home directory is blocked."),
    (r"\b(?:mkfs(?:\.[a-z0-9]+)?|diskpart|format\s+[a-z]:|dd\s+if=.*\s+of=/dev/)\b", "Disk formatting or raw-device writes are blocked."),
    (r"\bgit\s+reset\s+--hard\b", "Hard reset can destroy uncommitted work."),
    (r"\bgit\s+clean\s+-[^\s]*[fd][^\s]*\b", "Git clean can permanently delete untracked files."),
    (r"\bgit\s+push\b[^\n]*(?:--force|-f)(?:\s|$)", "Force-push is blocked."),
    (r"\bterraform\s+destroy\b", "Infrastructure destruction is blocked."),
    (r"\b(?:drop\s+database|truncate\s+table)\b", "Direct destructive database operations are blocked."),
    (r"\bchmod\s+(?:-r\s+)?777\b", "World-writable permissions are blocked."),
    (r"\b(?:cat|type|get-content|gc|more)\b[^\n]*(?:\.env(?:\s|$)|id_rsa|id_ed25519|\.pem(?:\s|$)|credentials(?:\.|\s|$))", "Reading likely secret files through the shell is blocked."),
    (r"\b(?:curl|wget|invoke-webrequest)\b[^\n]*(?:169\.254\.169\.254|metadata\.google\.internal)", "Cloud instance metadata access is blocked."),
]

# .env.example contains placeholders and is intentionally allowed.
if ".env.example" in normalized:
    normalized = normalized.replace(".env.example", "safe-example-file")

for pattern, reason in BLOCKS:
    if re.search(pattern, normalized, flags=re.IGNORECASE):
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        }))
        raise SystemExit(0)

print("{}")
