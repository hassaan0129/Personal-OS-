# Codex Power Kit

A safe, reusable Codex setup for personal projects. It includes global rules, model profiles, skills, subagents, MCP templates, project scaffolding, hooks, documentation templates, and one verification command.

## What this kit installs

### Global
- `~/.codex/AGENTS.md`
- `~/.codex/config.toml`
- `~/.codex/simple.config.toml`
- `~/.codex/normal.config.toml`
- `~/.codex/complex.config.toml`
- `~/.codex/rules/safety.rules`
- `~/.codex/agents/*.toml`
- `~/.agents/skills/*/SKILL.md`

### Per repository
- `AGENTS.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/hooks/*.py`
- standard documentation files
- `scripts/verify.py`
- `.env.example`

## Installation

### 1. Install global Codex files

Windows:

```powershell
py -3 install_global.py
```

macOS/Linux:

```bash
python3 install_global.py
```

Existing files are preserved unless you pass `--force`. With `--force`, the installer creates timestamped backups first.

### 2. Equip a repository

Windows:

```powershell
py -3 install_project.py "D:\path\to\repository"
```

macOS/Linux:

```bash
python3 install_project.py /path/to/repository
```

Then open Codex inside that repository. Review and trust the project hooks with `/hooks`.

### 3. Choose a model profile

```bash
codex --profile simple
codex --profile normal
codex --profile complex
```

- **simple**: fast, clear, repeatable tasks
- **normal**: everyday implementation and debugging
- **complex**: architecture, security, major refactors, ambiguous work

### 4. Run the project verification command

```bash
python scripts/verify.py
```

The script auto-detects JavaScript/TypeScript and Python projects, then runs available formatting checks, linting, type checks, tests, builds, and local secret scanning.

## MCP integrations

The default config enables only read-oriented documentation MCP servers. Review `global/mcp/mcp-snippets.toml` and copy integrations you actually need into `~/.codex/config.toml`.

Never paste tokens into TOML files. Store them in environment variables. Use development projects, read-only database access, preview deployments, and least-privilege tokens.

## Recommended first prompt in a repository

```text
Analyze this repository before changing anything. Read AGENTS.md and the project docs, map the architecture, identify the verification command, summarize risks, and create a small-step implementation plan. Do not edit until the plan is complete.
```

## Important

This kit is intentionally conservative. It prompts before pushes, deployments, infrastructure changes, package publishing, and production-like operations. It blocks common destructive commands and scans diffs for likely secrets.
