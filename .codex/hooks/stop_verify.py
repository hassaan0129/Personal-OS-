#!/usr/bin/env python3
"""Run the repository verification command once per changed tree before Codex stops."""
from __future__ import annotations
import hashlib, json, os, subprocess, sys
from pathlib import Path

try:
    payload = json.load(sys.stdin)
except Exception:
    payload = {}

# Avoid an infinite continuation loop. The next stop may report remaining failures.
if payload.get("stop_hook_active"):
    print(json.dumps({"continue": True}))
    raise SystemExit(0)

cwd = Path(payload.get("cwd") or os.getcwd())

def run(args, **kwargs):
    return subprocess.run(args, cwd=cwd, text=True, capture_output=True, errors="replace", **kwargs)

root_result = run(["git", "rev-parse", "--show-toplevel"])
if root_result.returncode != 0:
    print(json.dumps({"continue": True}))
    raise SystemExit(0)
root = Path(root_result.stdout.strip())
verify = root / "scripts" / "verify.py"
if not verify.exists():
    print(json.dumps({"continue": True, "systemMessage": "No scripts/verify.py found; final automatic verification was skipped."}))
    raise SystemExit(0)

status = subprocess.run(["git", "status", "--porcelain=v1"], cwd=root, text=True, capture_output=True, errors="replace")
if status.returncode != 0 or not status.stdout.strip():
    print(json.dumps({"continue": True}))
    raise SystemExit(0)

diff_a = subprocess.run(["git", "diff", "--binary"], cwd=root, capture_output=True).stdout
diff_b = subprocess.run(["git", "diff", "--cached", "--binary"], cwd=root, capture_output=True).stdout
fingerprint = hashlib.sha256(status.stdout.encode() + diff_a + diff_b).hexdigest()
state_dir = root / ".codex" / ".state"
state_dir.mkdir(parents=True, exist_ok=True)
state_file = state_dir / "last-verification.json"
try:
    previous = json.loads(state_file.read_text(encoding="utf-8"))
except Exception:
    previous = {}
if previous.get("fingerprint") == fingerprint and previous.get("passed") is True:
    print(json.dumps({"continue": True}))
    raise SystemExit(0)

result = subprocess.run([sys.executable, str(verify)], cwd=root, text=True, capture_output=True, errors="replace", timeout=900)
passed = result.returncode == 0
state_file.write_text(json.dumps({"fingerprint": fingerprint, "passed": passed}, indent=2), encoding="utf-8")
if passed:
    print(json.dumps({"continue": True, "systemMessage": "Project verification passed."}))
else:
    output = (result.stdout + "\n" + result.stderr).strip()
    if len(output) > 6000:
        output = output[-6000:]
    print(json.dumps({
        "decision": "block",
        "reason": "The final project verification failed. Fix the failures, rerun `python scripts/verify.py`, review the final diff, and then report honestly.\n\n" + output,
    }))
