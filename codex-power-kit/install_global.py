#!/usr/bin/env python3
from __future__ import annotations
import argparse, shutil
from datetime import datetime
from pathlib import Path

KIT = Path(__file__).resolve().parent
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")

parser = argparse.ArgumentParser(description="Install global Codex rules, profiles, agents, and skills.")
parser.add_argument("--codex-home", type=Path, default=Path.home() / ".codex")
parser.add_argument("--skills-home", type=Path, default=Path.home() / ".agents" / "skills")
parser.add_argument("--force", action="store_true")
args = parser.parse_args()


def copy_file(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if not args.force:
            print(f"SKIP existing: {dst}")
            return
        backup = dst.with_name(dst.name + f".backup-{STAMP}")
        shutil.copy2(dst, backup)
        print(f"BACKUP: {backup}")
    shutil.copy2(src, dst)
    print(f"INSTALL: {dst}")

copy_file(KIT / "global" / "AGENTS.md", args.codex_home / "AGENTS.md")
for name in ("config.toml", "simple.config.toml", "normal.config.toml", "complex.config.toml"):
    copy_file(KIT / "global" / name, args.codex_home / name)
for src in (KIT / "global" / "rules").glob("*.rules"):
    copy_file(src, args.codex_home / "rules" / src.name)
for src in (KIT / "global" / "agents").glob("*.toml"):
    copy_file(src, args.codex_home / "agents" / src.name)
for skill in (KIT / "global" / "skills").iterdir():
    if skill.is_dir():
        for src in skill.rglob("*"):
            if src.is_file():
                copy_file(src, args.skills_home / skill.name / src.relative_to(skill))

print("\nGlobal installation complete.")
print("Review optional MCP integrations in global/mcp/mcp-snippets.toml.")
print("Restart Codex, then test profiles with: codex --profile normal")
