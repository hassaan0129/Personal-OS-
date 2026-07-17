#!/usr/bin/env python3
"""Append a structured lesson entry without storing secrets."""
from __future__ import annotations
from datetime import date
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]
LESSONS = ROOT / "docs" / "LESSONS.md"

parser = argparse.ArgumentParser()
parser.add_argument("title")
parser.add_argument("--symptom", required=True)
parser.add_argument("--root-cause", required=True)
parser.add_argument("--correction", required=True)
parser.add_argument("--control", required=True)
args = parser.parse_args()

entry = (
    f"\n## {date.today().isoformat()} — {args.title}\n\n"
    f"- **Symptom:** {args.symptom}\n"
    "- **Evidence:** [add non-sensitive reference]\n"
    "- **Impact:** [add impact]\n"
    f"- **Root cause:** {args.root_cause}\n"
    f"- **Correction:** {args.correction}\n"
    f"- **Durable control:** {args.control}\n"
    "- **Follow-up:** [owner/date]\n"
)
LESSONS.parent.mkdir(parents=True, exist_ok=True)
if not LESSONS.exists():
    LESSONS.write_text("# Lessons and Repeated Mistakes\n", encoding="utf-8")
with LESSONS.open("a", encoding="utf-8") as fh:
    fh.write(entry)
print(f"Recorded lesson in {LESSONS}")
