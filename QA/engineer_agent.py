#!/usr/bin/env python3
"""
Engineer agent for proposing fixes for open QA issues.

Usage:
  python3 QA/engineer_agent.py
  python3 QA/engineer_agent.py --issues QA/issues.yaml --yaml-only

Environment:
  OPENAI_API_KEY   Required to call the OpenAI API
  OPENAI_MODEL     Optional, defaults to gpt-5.4-mini
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_MODEL = "gpt-5.4-mini"
DEFAULT_ISSUES_PATH = Path("QA/issues.yaml")
RESPONSES_API_URL = "https://api.openai.com/v1/responses"
SYSTEM_PROMPT = """
You are an engineering fix agent for a film web app.

Your job is to:
- identify the most likely root cause of each open issue
- propose the most likely fix
- keep the response precise, actionable, and implementation-focused

Rules:
- be specific and concise
- reference files, functions, modules, selectors, or data files where possible
- do not give vague suggestions
- do not explain concepts unless necessary
- prioritise the highest-confidence root cause first

Output:
- start with a short human-readable diagnosis
- end with a YAML block using:

issue:
  title:
  root_cause:
  suggested_fix:
  confidence:
""".strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read open QA issues and ask an LLM to propose fixes."
    )
    parser.add_argument(
        "--issues",
        default=str(DEFAULT_ISSUES_PATH),
        help="Path to issues.yaml (default: QA/issues.yaml)",
    )
    parser.add_argument(
        "--yaml-only",
        action="store_true",
        help="Print only the YAML section returned by the LLM.",
    )
    return parser.parse_args()


def load_yaml(path: Path) -> Any:
    try:
        import yaml  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "PyYAML is required to read QA/issues.yaml. Install it with `pip install pyyaml`."
        ) from exc

    if not path.exists():
        raise SystemExit(f"Issues file not found: {path}")

    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def get_open_issues(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        issues = payload.get("issues", [])
    elif isinstance(payload, list):
        issues = payload
    else:
        issues = []

    open_issues = []
    for issue in issues:
        if not isinstance(issue, dict):
            continue
        if str(issue.get("status", "")).strip().lower() == "open":
            open_issues.append(issue)
    return open_issues


def build_issue_prompt(issue: dict[str, Any]) -> str:
    issue_json = json.dumps(issue, ensure_ascii=False, indent=2)
    return textwrap.dedent(
        f"""
        Review this open engineering issue for the film web app and propose the most likely fix.

        Issue:
        {issue_json}

        Follow this process:
        1. Identify the most likely root cause
        2. Propose the most likely fix
        3. Keep the output implementation-focused
        4. If uncertain, say what exact file or runtime check would confirm it
        """
    ).strip()


def call_llm(prompt: str, model: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set.")

    body = {
        "model": model,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": [{"type": "input_text", "text": prompt}]},
        ],
    }

    request = urllib.request.Request(
        RESPONSES_API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_text = exc.read().decode("utf-8", errors="ignore")
        raise SystemExit(f"OpenAI API request failed: {exc.code} {error_text}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"OpenAI API request failed: {exc}") from exc

    text = payload.get("output_text", "").strip()
    if text:
        return text

    parts: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                parts.append(content.get("text", ""))
    return "\n".join(part for part in parts if part).strip()


def extract_yaml_block(text: str) -> str:
    marker = "issue:"
    start = text.find(marker)
    if start == -1:
        return text.strip()
    return text[start:].strip()


def render_report(issue: dict[str, Any], response_text: str, yaml_only: bool) -> str:
    if yaml_only:
        return extract_yaml_block(response_text)

    title = issue.get("title") or issue.get("id") or "Untitled issue"
    divider = "=" * 80
    return f"{divider}\nISSUE: {title}\n{divider}\n{response_text.strip()}\n"


def main() -> int:
    args = parse_args()
    issues_path = Path(args.issues)
    payload = load_yaml(issues_path)
    open_issues = get_open_issues(payload)

    if not open_issues:
        print(f"No open issues found in {issues_path}.")
        return 0

    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)

    for issue in open_issues:
        prompt = build_issue_prompt(issue)
        response_text = call_llm(prompt, model=model)
        print(render_report(issue, response_text, yaml_only=args.yaml_only))

    return 0


if __name__ == "__main__":
    sys.exit(main())
