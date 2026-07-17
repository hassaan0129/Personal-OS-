#!/usr/bin/env python3
"""Strict, non-mutating verification runner for the Personal OS workspace."""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Step:
    name: str
    command: tuple[str, ...]


def package_manager() -> str:
    if sys.platform == "win32" and shutil.which("pnpm.cmd"):
        return "pnpm.cmd"
    if shutil.which("pnpm"):
        return "pnpm"
    raise RuntimeError("pnpm is required for verification but was not found on PATH.")


def run(step: Step) -> bool:
    print(f"\n[{step.name}]\n$ {' '.join(step.command)}")
    started_at = time.monotonic()
    result = subprocess.run(step.command, cwd=ROOT, check=False)
    elapsed_seconds = time.monotonic() - started_at
    if result.returncode == 0:
        print(f"PASS ({elapsed_seconds:.1f}s)")
        return True
    print(f"FAIL exit={result.returncode} ({elapsed_seconds:.1f}s)")
    return False


def main() -> int:
    try:
        manager = package_manager()
    except RuntimeError as error:
        print(f"FAIL: {error}")
        return 1

    steps = (
        Step("format", (manager, "run", "format:check")),
        Step("lint", (manager, "run", "lint")),
        Step("typecheck", (manager, "run", "typecheck")),
        Step("tests", (manager, "run", "test")),
        Step("web production build", (manager, "run", "build:web")),
        Step("mobile validation", (manager, "run", "validate:mobile")),
    )
    results = [run(step) for step in steps]
    successful = all(results)
    print("\n=== Verification summary ===")
    print(f"Executed: {len(steps)}")
    print("RESULT: " + ("PASS" if successful else "FAIL"))
    return 0 if successful else 1


if __name__ == "__main__":
    raise SystemExit(main())
