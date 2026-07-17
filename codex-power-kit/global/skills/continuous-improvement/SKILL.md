---
name: continuous-improvement
description: Convert repeated Codex or project mistakes into durable improvements; use after corrections, regressions, failed verification, or recurring workflow problems.
---

# Continuous improvement workflow

1. Record the event in `docs/LESSONS.md`: date, symptom, evidence, impact, root cause, and correction.
2. Search for similar prior entries to confirm repetition.
3. Choose the narrowest durable control:
   - test for product behavior
   - hook or command rule for deterministic safety
   - skill for a reusable process
   - `AGENTS.md` for behavioral guidance
   - architecture/API/database docs for project knowledge
4. Add the control and verify it catches the original problem without excessive false positives.
5. Link the lesson to the commit or decision entry.
6. Periodically remove obsolete, duplicated, or contradictory controls.
7. Never store secrets, personal data, tokens, or sensitive raw logs.
