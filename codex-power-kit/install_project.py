#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, shutil
from datetime import datetime
from pathlib import Path

KIT = Path(__file__).resolve().parent
TEMPLATE = KIT / "project-template"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")

parser = argparse.ArgumentParser(description="Equip a repository with Codex project instructions, hooks, docs, and verification.")
parser.add_argument("repository", type=Path)
parser.add_argument("--force", action="store_true")
args = parser.parse_args()
repo = args.repository.expanduser().resolve()
if not repo.exists() or not repo.is_dir():
    raise SystemExit(f"Repository directory does not exist: {repo}")


def copy_file(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if not args.force:
            print(f"SKIP existing: {dst.relative_to(repo)}")
            return
        backup = dst.with_name(dst.name + f".backup-{STAMP}")
        shutil.copy2(dst, backup)
        print(f"BACKUP: {backup.relative_to(repo)}")
    shutil.copy2(src, dst)
    print(f"INSTALL: {dst.relative_to(repo)}")

for src in TEMPLATE.rglob("*"):
    if src.is_file() and src.name != "hooks.json":
        copy_file(src, repo / src.relative_to(TEMPLATE))

hook_dir = repo / ".codex" / "hooks"
def cmd(script: str, windows: bool = False) -> str:
    path = hook_dir / script
    return f'python "{path}"'

hooks = {
    "hooks": {
        "PreToolUse": [{
            "matcher": "^Bash$",
            "hooks": [{
                "type": "command",
                "command": cmd("pre_tool_policy.py"),
                "commandWindows": cmd("pre_tool_policy.py", True),
                "timeout": 30,
                "statusMessage": "Checking command safety"
            }]
        }],
        "PostToolUse": [{
            "matcher": "^(Bash|apply_patch|Edit|Write)$",
            "hooks": [{
                "type": "command",
                "command": cmd("post_tool_secret_scan.py"),
                "commandWindows": cmd("post_tool_secret_scan.py", True),
                "timeout": 45,
                "statusMessage": "Scanning changed files for secrets"
            }]
        }],
        "Stop": [{
            "hooks": [{
                "type": "command",
                "command": cmd("stop_verify.py"),
                "commandWindows": cmd("stop_verify.py", True),
                "timeout": 930,
                "statusMessage": "Running final project verification"
            }]
        }]
    }
}
hooks_path = repo / ".codex" / "hooks.json"
if hooks_path.exists() and not args.force:
    print("SKIP existing: .codex/hooks.json")
else:
    if hooks_path.exists():
        backup = hooks_path.with_name(hooks_path.name + f".backup-{STAMP}")
        shutil.copy2(hooks_path, backup)
        print(f"BACKUP: {backup.relative_to(repo)}")
    hooks_path.parent.mkdir(parents=True, exist_ok=True)
    hooks_path.write_text(json.dumps(hooks, indent=2), encoding="utf-8")
    print("INSTALL: .codex/hooks.json")

print("\nProject installation complete.")
print("Next steps:")
print("1. Customize AGENTS.md and the docs.")
print("2. Merge .gitignore.codex-additions into .gitignore.")
print("3. Run: python scripts/verify.py")
print("4. Open Codex and review/trust hooks with /hooks.")
