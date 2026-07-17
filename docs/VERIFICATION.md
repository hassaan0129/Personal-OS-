# Verification

The canonical command is:

```bash
python scripts/verify.py
```

The generic script auto-detects available checks. For a mature project, make sure the project exposes non-mutating commands for all applicable stages:

1. format check
2. lint
3. typecheck
4. tests
5. production build
6. local secret scan

Recommended JavaScript scripts:

```json
{
  "scripts": {
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "next build",
    "verify": "python scripts/verify.py"
  }
}
```

Recommended Python tools: Ruff format/check, mypy or pyright, pytest, and a production import/build check.
