#!/usr/bin/env python3
"""Cross-platform, non-mutating project verification runner.

Auto-detects common Node and Python checks. It never installs dependencies and
never uses network access intentionally. Missing checks are reported as skips;
actual command failures make the script fail.
"""
from __future__ import annotations
import argparse, importlib.util, json, os, re, shutil, subprocess, sys, time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

@dataclass
class Step:
    group: str
    name: str
    command: list[str]


def executable(name: str) -> bool:
    return shutil.which(name) is not None


def module_exists(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def run(step: Step) -> bool:
    printable = " ".join(step.command)
    print(f"\n[{step.group}] {step.name}\n$ {printable}")
    start = time.time()
    result = subprocess.run(step.command, cwd=ROOT)
    elapsed = time.time() - start
    if result.returncode == 0:
        print(f"PASS ({elapsed:.1f}s)")
        return True
    print(f"FAIL exit={result.returncode} ({elapsed:.1f}s)")
    return False


def node_context():
    package_file = ROOT / "package.json"
    if not package_file.exists():
        return None
    data = json.loads(package_file.read_text(encoding="utf-8"))
    scripts = data.get("scripts") or {}
    if (ROOT / "pnpm-lock.yaml").exists():
        manager = "pnpm"
    elif (ROOT / "yarn.lock").exists():
        manager = "yarn"
    elif (ROOT / "bun.lockb").exists() or (ROOT / "bun.lock").exists():
        manager = "bun"
    else:
        manager = "npm"
    return manager, scripts


def script_step(group: str, label: str, manager: str, script: str) -> Step:
    return Step(group, label, [manager, "run", script])


def local_node_bin(name: str) -> Path | None:
    suffix = ".cmd" if os.name == "nt" else ""
    p = ROOT / "node_modules" / ".bin" / f"{name}{suffix}"
    return p if p.exists() else None


def python_sources() -> list[str]:
    candidates = []
    for name in ("src", "app", "tests"):
        if (ROOT / name).exists():
            candidates.append(name)
    if not candidates:
        candidates = [str(p.relative_to(ROOT)) for p in ROOT.glob("*.py")]
    return candidates


def build_steps() -> tuple[list[Step], list[str]]:
    steps: list[Step] = []
    skips: list[str] = []
    node = node_context()
    if node:
        manager, scripts = node
        if not executable(manager):
            skips.append(f"Node checks: package manager '{manager}' is not on PATH")
        else:
            fmt = next((s for s in ("format:check", "format-check", "check:format") if s in scripts), None)
            if fmt:
                steps.append(script_step("format", "JavaScript/TypeScript format check", manager, fmt))
            elif (prettier := local_node_bin("prettier")):
                steps.append(Step("format", "Prettier check", [str(prettier), "--check", "."]))
            else:
                skips.append("format: no non-mutating Node format check found")

            if "lint" in scripts:
                steps.append(script_step("lint", "JavaScript/TypeScript lint", manager, "lint"))
            else:
                skips.append("lint: no Node lint script found")

            type_script = next((s for s in ("typecheck", "type-check", "check:types", "types") if s in scripts), None)
            if type_script:
                steps.append(script_step("typecheck", "JavaScript/TypeScript typecheck", manager, type_script))
            elif (tsc := local_node_bin("tsc")) and (ROOT / "tsconfig.json").exists():
                steps.append(Step("typecheck", "TypeScript compiler", [str(tsc), "--noEmit"]))
            else:
                skips.append("typecheck: no Node typecheck found")

            if "test" in scripts:
                steps.append(script_step("test", "Node test suite", manager, "test"))
            else:
                skips.append("test: no Node test script found")

            if "build" in scripts:
                steps.append(script_step("build", "Node production build", manager, "build"))
            else:
                skips.append("build: no Node build script found")

    py_project = any((ROOT / f).exists() for f in ("pyproject.toml", "requirements.txt", "setup.py", "setup.cfg")) or any(ROOT.glob("*.py"))
    if py_project:
        sources = python_sources() or ["."]
        if module_exists("ruff"):
            steps.append(Step("format", "Ruff format check", [sys.executable, "-m", "ruff", "format", "--check", *sources]))
            steps.append(Step("lint", "Ruff lint", [sys.executable, "-m", "ruff", "check", *sources]))
        elif module_exists("black"):
            steps.append(Step("format", "Black format check", [sys.executable, "-m", "black", "--check", *sources]))
            skips.append("lint: Ruff/flake8 not found")
        elif module_exists("flake8"):
            steps.append(Step("lint", "Flake8", [sys.executable, "-m", "flake8", *sources]))
            skips.append("format: Ruff/Black not found")
        else:
            skips.append("format/lint: Ruff, Black, and flake8 not installed")

        config_text = ""
        for f in ("pyproject.toml", "setup.cfg", "mypy.ini"):
            p = ROOT / f
            if p.exists(): config_text += p.read_text(encoding="utf-8", errors="ignore")
        if module_exists("mypy") and ("mypy" in config_text.lower() or (ROOT / "mypy.ini").exists()):
            steps.append(Step("typecheck", "mypy", [sys.executable, "-m", "mypy", *sources]))
        elif module_exists("pyright"):
            steps.append(Step("typecheck", "pyright", [sys.executable, "-m", "pyright"]))
        else:
            skips.append("typecheck: configured mypy/pyright not found")

        if (ROOT / "tests").exists() and module_exists("pytest"):
            steps.append(Step("test", "pytest", [sys.executable, "-m", "pytest"]))
        else:
            skips.append("test: tests/ or pytest not found")

        compile_targets = [s for s in sources if s != "tests"] or sources
        steps.append(Step("build", "Python compile check", [sys.executable, "-m", "compileall", "-q", *compile_targets]))

        if module_exists("pip_audit"):
            steps.append(Step("security", "Python dependency audit", [sys.executable, "-m", "pip_audit", "--local"]))
        else:
            skips.append("security: pip-audit not installed")

    if executable("gitleaks"):
        steps.append(Step("security", "Gitleaks working-tree scan", ["gitleaks", "detect", "--no-git", "--source", str(ROOT), "--redact"]))
    else:
        skips.append("security: gitleaks not installed; lightweight secret scan will run")
    return steps, skips


def lightweight_secret_scan() -> bool:
    patterns = [
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
        re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
        re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
        re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b"),
        re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    ]
    excluded = {".git", "node_modules", ".venv", "venv", "dist", "build", ".next", "coverage", ".codex"}
    findings = []
    for p in ROOT.rglob("*"):
        if not p.is_file() or p.name == ".env.example" or any(part in excluded for part in p.parts):
            continue
        try:
            if p.stat().st_size > 1_000_000: continue
            text = p.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if any(pattern.search(text) for pattern in patterns):
            findings.append(str(p.relative_to(ROOT)))
    print("\n[security] Lightweight secret scan")
    if findings:
        print("FAIL potential secret material in: " + ", ".join(findings[:20]))
        print("Values were not printed. Remove/rotate credentials before continuing.")
        return False
    print("PASS")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict-missing", action="store_true", help="Fail when an applicable verification category is missing")
    args = parser.parse_args()
    steps, skips = build_steps()
    print(f"Repository: {ROOT}")
    if skips:
        print("\nSkipped/unavailable checks:")
        for item in skips: print(f"- {item}")
    results = [run(step) for step in steps]
    results.append(lightweight_secret_scan())
    missing_failure = args.strict_missing and bool(skips)
    ok = all(results) and not missing_failure
    print("\n=== Verification summary ===")
    print(f"Executed: {len(steps) + 1}")
    print(f"Skipped: {len(skips)}")
    print("RESULT: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
