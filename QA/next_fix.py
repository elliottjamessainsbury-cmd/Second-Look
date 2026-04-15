#!/usr/bin/env python3
"""
Print the next engineering-fix prompt from QA/issues.yaml.

Usage:
  python3 QA/next_fix.py
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


ISSUES_PATH = Path("QA/issues.yaml")


def load_issues() -> list[dict[str, Any]]:
    if not ISSUES_PATH.exists():
        raise SystemExit(f"No issues file found at {ISSUES_PATH}")

    payload = yaml.safe_load(ISSUES_PATH.read_text(encoding="utf-8")) or {}

    if isinstance(payload, dict) and isinstance(payload.get("issues"), list):
        return [issue for issue in payload["issues"] if isinstance(issue, dict)]

    if isinstance(payload, list):
        return [issue for issue in payload if isinstance(issue, dict)]

    return []


def severity_rank(value: str) -> int:
    ranks = {"high": 0, "medium": 1, "low": 2}
    return ranks.get(str(value or "").strip().lower(), 3)


def confidence_rank(value: str) -> int:
    ranks = {"high": 0, "medium": 1, "low": 2}
    return ranks.get(str(value or "").strip().lower(), 3)


def pick_next_issue(issues: list[dict[str, Any]]) -> dict[str, Any] | None:
    open_issues = [
        issue
        for issue in issues
        if str(issue.get("status", "")).strip().lower() == "open"
    ]

    if not open_issues:
        return None

    open_issues.sort(
        key=lambda issue: (
            severity_rank(issue.get("severity", "")),
            confidence_rank(issue.get("confidence", "")),
            str(issue.get("title", "")).lower(),
        )
    )
    return open_issues[0]


def build_prompt(issue: dict[str, Any]) -> str:
    title = issue.get("title", "Untitled issue")
    return f"""Top open issue:
{title}

Next prompt:
Act as the engineering fix agent for this film web app.

Read QA/issues.yaml and fix the open issue titled:
"{title}"

Your task:
- inspect the relevant code and data files
- implement the most likely fix directly
- keep the change minimal and precise
- update QA/issues.yaml to mark the issue as fixed if successful
- if not fixable, explain exactly what is blocked and leave it open

Output:
- short summary of the fix
- files changed
- whether the issue status was updated
"""


def main() -> int:
    issues = load_issues()
    next_issue = pick_next_issue(issues)

    if not next_issue:
      print("No open issues found in QA/issues.yaml.")
      return 0

    print(build_prompt(next_issue))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
