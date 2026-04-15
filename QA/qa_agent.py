#!/usr/bin/env python3
"""
Single-flow QA investigation agent for the film web app.

This agent is intentionally constrained:
- it works against one flow at a time
- it inspects code and local artifacts only
- it chooses one next action per step
- it writes only validated, non-duplicate issues to QA/issues.yaml

Usage:
  python3 QA/qa_agent.py --flow QA/flows/see-more-expansion.md
  python3 QA/qa_agent.py

Environment:
  OPENAI_API_KEY   Required to call the OpenAI API
  OPENAI_MODEL     Optional, defaults to gpt-5.4-mini
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import yaml


BASE_DIR = Path("QA")
PROMPT_PATH = BASE_DIR / "qa-agent-prompt.md"
SMOKETEST_PATH = BASE_DIR / "smoketest.md"
FLOWS_DIR = BASE_DIR / "flows"
ISSUES_PATH = BASE_DIR / "issues.yaml"
RESPONSES_API_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.4-mini"
MAX_STEPS = 8
PREVIEW_CHARS = 2400
MAX_SEARCH_MATCHES = 20
ALLOWED_ACTIONS = {"read_file", "search_code", "report_issue", "stop"}
REQUIRED_ISSUE_FIELDS = {
    "title",
    "description",
    "impacted_test",
    "severity",
    "confidence",
    "suggested_fix",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the QA investigation agent for one or more smoke-test flows."
    )
    parser.add_argument(
        "--flow",
        help="Optional path to a single .md flow file. If omitted, all flow files are processed one by one.",
    )
    parser.add_argument(
        "--max-steps",
        type=int,
        default=MAX_STEPS,
        help=f"Maximum investigation steps per flow (default: {MAX_STEPS}).",
    )
    return parser.parse_args()


def read_text(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Required file not found: {path}")
    return path.read_text(encoding="utf-8").strip()


def get_flow_paths(single_flow: str | None = None) -> list[Path]:
    if single_flow:
        path = Path(single_flow)
        if not path.exists():
            raise SystemExit(f"Flow file not found: {path}")
        return [path]

    flow_files = sorted(FLOWS_DIR.glob("*.md"))
    if not flow_files:
        raise SystemExit(f"No flow files found in {FLOWS_DIR}")
    return flow_files


def load_existing_issues() -> dict[str, Any]:
    if not ISSUES_PATH.exists():
        return {"issues": []}

    with ISSUES_PATH.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}

    if isinstance(payload, dict) and isinstance(payload.get("issues"), list):
        return payload
    if isinstance(payload, list):
        return {"issues": payload}
    return {"issues": []}


def search_codebase(query: str, root: Path = Path(".")) -> list[str]:
    matches: list[str] = []
    query_lower = query.lower()

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part.startswith(".") for part in path.parts):
            continue
        if path.suffix not in {".py", ".js", ".ts", ".tsx", ".json", ".md", ".css", ".html"}:
            continue

        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue

        if query_lower in text.lower():
            matches.append(path.as_posix())
            if len(matches) >= MAX_SEARCH_MATCHES:
                break

    return matches


def call_openai_json(system_prompt: str, user_prompt: str, model: str) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY is not set.")
    if api_key.strip() in {"your-key-here", "your-real-key", "your-real-openai-api-key"}:
        raise SystemExit(
            "OPENAI_API_KEY is still set to a placeholder value. "
            "Set it to your real API key in this terminal session and try again."
        )

    body = {
        "model": model,
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_prompt}]},
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
        lowered = error_text.lower()
        if "invalid_api_key" in lowered or "incorrect api key" in lowered:
            raise SystemExit(
                "OpenAI API request failed: the OPENAI_API_KEY in this terminal session is invalid. "
                "Reset it with your real key, then rerun the command."
            ) from exc
        if "insufficient_quota" in lowered:
            raise SystemExit(
                "OpenAI API request failed: this API project does not currently have available quota or billing. "
                "Check your OpenAI API billing/project settings, then retry."
            ) from exc
        raise SystemExit(f"OpenAI API request failed: {exc.code} {error_text}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"OpenAI API request failed: {exc}") from exc

    raw_text = payload.get("output_text", "").strip()
    if not raw_text:
        parts: list[str] = []
        for item in payload.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text":
                    parts.append(content.get("text", ""))
        raw_text = "\n".join(part for part in parts if part).strip()

    return parse_first_json_object(raw_text)


def parse_first_json_object(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    if start == -1:
        raise SystemExit("Model did not return a JSON object.")

    depth = 0
    in_string = False
    escaped = False
    end = None

    for index, char in enumerate(text[start:], start=start):
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break

    if end is None:
        raise SystemExit("Could not extract a balanced JSON object from model output.")

    snippet = text[start:end]
    try:
        parsed = json.loads(snippet)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse model JSON output: {exc}") from exc

    if not isinstance(parsed, dict):
        raise SystemExit("Model returned JSON, but it was not an object.")
    return parsed


def summarize_text(text: str, limit: int = PREVIEW_CHARS) -> str:
    clean = text.strip()
    if len(clean) <= limit:
        return clean
    return clean[:limit] + "\n...[truncated]"


def summarize_observations(observations: list[dict[str, Any]]) -> str:
    if not observations:
        return "No observations gathered yet."

    lines: list[str] = []
    for index, item in enumerate(observations, start=1):
        kind = item.get("type")
        if kind == "file_read":
            lines.append(
                f"{index}. read_file -> {item['path']}\nPreview:\n{item['content_preview']}"
            )
        elif kind == "code_search":
            matches = item.get("matches", [])
            match_text = ", ".join(matches) if matches else "No matches"
            lines.append(f"{index}. search_code -> {item['query']}\nMatches: {match_text}")
        elif kind == "note":
            lines.append(f"{index}. note -> {item['message']}")

    return "\n\n".join(lines)


def build_agent_prompt(
    *,
    system_prompt: str,
    smoketest_rules: str,
    flow_path: Path,
    flow_text: str,
    state: dict[str, Any],
    existing_titles: list[str],
) -> str:
    return f"""
{system_prompt}

You are investigating exactly one QA flow using code and local artifacts only.
Do not assume browser/runtime behavior unless it is supported by the flow and by code evidence.
Choose exactly one next action and return JSON only.

Master QA rules:
{smoketest_rules}

Active flow: {flow_path.as_posix()}
{flow_text}

Existing issue titles:
{json.dumps(existing_titles, ensure_ascii=False)}

Current state:
{json.dumps(
    {
        "goal": state["goal"],
        "iteration": state["iteration"],
        "visited_files": state["visited_files"],
        "search_queries": state["search_queries"],
    },
    ensure_ascii=False,
    indent=2,
)}

Observations so far:
{summarize_observations(state["observations"])}

Available actions:
- read_file
- search_code
- report_issue
- stop

Action rules:
- Prefer the smallest useful next step.
- Use read_file for the active flow, app files, data files, or issue files when needed.
- Use search_code to find relevant files before reading them.
- Do not report an issue without concrete evidence from the flow plus code/data inspection.
- If confidence is not high, gather one more observation.
- If no issue is supported by evidence, stop explicitly.

Return one JSON object using exactly one of these shapes:

For read_file:
{{
  "action": "read_file",
  "reason": "short reason",
  "path": "path/to/file"
}}

For search_code:
{{
  "action": "search_code",
  "reason": "short reason",
  "query": "search text"
}}

For report_issue:
{{
  "action": "report_issue",
  "reason": "short reason",
  "issue": {{
    "title": "short issue title",
    "description": "1-2 sentence summary",
    "impacted_test": "exact smoke-test step",
    "severity": "low|medium|high",
    "confidence": "low|medium|high",
    "suggested_fix": "precise actionable fix",
    "source_flow": "{flow_path.as_posix()}",
    "status": "open"
  }}
}}

For stop:
{{
  "action": "stop",
  "reason": "why no issue is supported by evidence"
}}
""".strip()


def validate_action(decision: dict[str, Any]) -> str:
    action = decision.get("action")
    if action not in ALLOWED_ACTIONS:
        raise SystemExit(f"Model returned invalid action: {action!r}")
    return action


def normalize_issue(issue: dict[str, Any], flow_path: Path) -> dict[str, Any]:
    normalized = {
        "title": str(issue.get("title", "")).strip(),
        "description": str(issue.get("description", "")).strip(),
        "impacted_test": str(issue.get("impacted_test", "")).strip(),
        "severity": str(issue.get("severity", "")).strip().lower() or "medium",
        "confidence": str(issue.get("confidence", "")).strip().lower() or "medium",
        "suggested_fix": str(issue.get("suggested_fix", "")).strip(),
        "source_flow": str(issue.get("source_flow", flow_path.as_posix())).strip(),
        "status": str(issue.get("status", "open")).strip().lower() or "open",
    }

    missing = [field for field in REQUIRED_ISSUE_FIELDS if not normalized.get(field)]
    if missing:
        raise SystemExit(f"Model reported an issue missing required fields: {', '.join(missing)}")

    if normalized["severity"] not in {"low", "medium", "high"}:
        raise SystemExit(f"Invalid issue severity: {normalized['severity']}")
    if normalized["confidence"] not in {"low", "medium", "high"}:
        raise SystemExit(f"Invalid issue confidence: {normalized['confidence']}")
    if normalized["status"] not in {"open", "fixed"}:
        raise SystemExit(f"Invalid issue status: {normalized['status']}")

    return normalized


def append_issue_if_new(issue: dict[str, Any]) -> bool:
    payload = load_existing_issues()
    existing = payload["issues"]
    seen_titles = {str(item.get("title", "")).strip().lower() for item in existing}
    title_key = issue["title"].strip().lower()

    if title_key in seen_titles:
        return False

    existing.append(issue)
    with ISSUES_PATH.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(
            {"issues": existing},
            handle,
            sort_keys=False,
            allow_unicode=True,
            default_flow_style=False,
        )
    return True


def run_flow(flow_path: Path, *, model: str, max_steps: int) -> dict[str, Any]:
    system_prompt = read_text(PROMPT_PATH)
    smoketest_rules = read_text(SMOKETEST_PATH)
    flow_text = read_text(flow_path)
    existing_titles = [
        str(issue.get("title", "")).strip()
        for issue in load_existing_issues().get("issues", [])
        if str(issue.get("title", "")).strip()
    ]

    state: dict[str, Any] = {
        "goal": f"Diagnose the active smoke-test flow: {flow_path.name}",
        "iteration": 0,
        "observations": [],
        "visited_files": [],
        "search_queries": [],
    }

    for step in range(max_steps):
        state["iteration"] = step + 1
        prompt = build_agent_prompt(
            system_prompt=system_prompt,
            smoketest_rules=smoketest_rules,
            flow_path=flow_path,
            flow_text=flow_text,
            state=state,
            existing_titles=existing_titles,
        )
        decision = call_openai_json(system_prompt=system_prompt, user_prompt=prompt, model=model)
        action = validate_action(decision)

        if action == "read_file":
            path = Path(str(decision.get("path", "")).strip())
            if not path.exists():
                state["observations"].append(
                    {"type": "note", "message": f"Requested file does not exist: {path.as_posix()}"}
                )
                continue

            content = path.read_text(encoding="utf-8")
            state["visited_files"].append(path.as_posix())
            state["observations"].append(
                {
                    "type": "file_read",
                    "path": path.as_posix(),
                    "content_preview": summarize_text(content),
                }
            )
            continue

        if action == "search_code":
            query = str(decision.get("query", "")).strip()
            if not query:
                raise SystemExit("Model chose search_code without a query.")
            matches = search_codebase(query)
            state["search_queries"].append(query)
            state["observations"].append(
                {"type": "code_search", "query": query, "matches": matches}
            )
            continue

        if action == "report_issue":
            raw_issue = decision.get("issue")
            if not isinstance(raw_issue, dict):
                raise SystemExit("Model chose report_issue without an issue object.")
            issue = normalize_issue(raw_issue, flow_path=flow_path)
            created = append_issue_if_new(issue)
            return {
                "status": "issue_found",
                "issue": issue,
                "created": created,
                "steps_used": step + 1,
            }

        if action == "stop":
            return {
                "status": "no_issue_found",
                "reason": str(decision.get("reason", "No issue supported by current evidence.")),
                "steps_used": step + 1,
            }

    return {
        "status": "max_steps_reached",
        "reason": f"Agent did not converge within {max_steps} steps.",
        "steps_used": max_steps,
    }


def main() -> int:
    args = parse_args()
    model = os.environ.get("OPENAI_MODEL", DEFAULT_MODEL)
    flow_paths = get_flow_paths(args.flow)

    found = 0
    for flow_path in flow_paths:
        result = run_flow(flow_path, model=model, max_steps=args.max_steps)
        if result["status"] == "issue_found":
            issue = result["issue"]
            status_text = "added" if result["created"] else "duplicate"
            print(f"{flow_path.name}: {status_text} issue -> {issue['title']}")
            found += 1 if result["created"] else 0
        elif result["status"] == "no_issue_found":
            print(f"{flow_path.name}: no issue found ({result['reason']})")
        else:
            print(f"{flow_path.name}: {result['status']} ({result['reason']})")

    if found:
        print(f"QA run completed. Added {found} new issue(s) to {ISSUES_PATH.as_posix()}.")
    else:
        print("QA run completed with no new issues.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
