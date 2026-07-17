#!/usr/bin/env python3
"""Scan changed text files for likely committed secrets without printing values."""
from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path

try:
    payload = json.load(sys.stdin)
except Exception:
    payload = {}

cwd = Path(payload.get("cwd") or os.getcwd())

def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=cwd, text=True, capture_output=True, errors="replace")

root_result = run("git", "rev-parse", "--show-toplevel")
if root_result.returncode != 0:
    print("{}")
    raise SystemExit(0)
root = Path(root_result.stdout.strip())
status = run("git", "status", "--porcelain=v1", "-z")
if status.returncode != 0:
    print("{}")
    raise SystemExit(0)

paths: set[Path] = set()
for entry in status.stdout.split("\0"):
    if not entry or len(entry) < 4:
        continue
    raw = entry[3:]
    if " -> " in raw:
        raw = raw.split(" -> ", 1)[1]
    p = (root / raw).resolve()
    try:
        p.relative_to(root.resolve())
    except ValueError:
        continue
    if p.is_file():
        paths.add(p)

EXCLUDED_NAMES = {".env.example", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "uv.lock", "poetry.lock"}
EXCLUDED_PARTS = {"node_modules", ".git", ".venv", "venv", "dist", "build", ".next", "coverage"}
PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|client[_-]?secret|password)\b\s*[:=]\s*[\"'][^\"'\n]{16,}[\"']"),
]
PLACEHOLDER_WORDS = ("example", "placeholder", "replace_me", "changeme", "your_", "test_", "dummy")
findings: list[str] = []
for path in sorted(paths):
    if path.name in EXCLUDED_NAMES or any(part in EXCLUDED_PARTS for part in path.parts):
        continue
    try:
        if path.stat().st_size > 1_000_000:
            continue
        data = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    for lineno, line in enumerate(data.splitlines(), 1):
        low = line.lower()
        if any(word in low for word in PLACEHOLDER_WORDS):
            continue
        if any(pattern.search(line) for pattern in PATTERNS):
            findings.append(f"{path.relative_to(root)}:{lineno}")
            break

if findings:
    listed = ", ".join(findings[:12])
    if len(findings) > 12:
        listed += f", and {len(findings) - 12} more"
    reason = "Potential secret material detected in changed files at: " + listed + ". Remove it, rotate any real credential, and use placeholders or environment variables. Values were not printed."
    print(json.dumps({
        "decision": "block",
        "reason": reason,
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": reason,
        },
    }))
else:
    print("{}")
