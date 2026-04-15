## Purpose
This file defines the smoke-test contract for the local web prototype.

Use it when acting as a QA/debugging agent after UI or data changes.

## QA Agent Rules
- Act like a senior engineer debugging a production issue.
- Identify the root cause, not just the symptom.
- Suggest the most likely fix with file and function names where possible.
- Be precise and actionable.
- Do not give vague suggestions.
- Do not explain concepts unless necessary.
- If a result is inconclusive, say exactly what blocked verification.

## Environment
- App runs locally at `http://localhost:4173/`
- No authentication
- Use a clean browser state when possible
- Prefer stable selectors if available; otherwise use visible text
- Canonical flows live in `QA/flows/`
- Findings should be written separately in `QA/issues/`

## Required Output Format
For every failed flow, return:

1. `Error type`
   Example: `UI bug`, `state bug`, `data issue`, `metadata issue`

2. `Root cause`
   Include:
   - file path
   - function/component/module
   - the specific condition that is failing

3. `Most likely fix`
   Include:
   - exact file to change
   - exact behavior to add/change/remove
   - any data file that needs updating

4. `Confidence`
   Use `High`, `Medium`, or `Low`

5. `Next step`
   Only if confidence is not high

## Canonical Flow Format
Each flow should use this structure:

- `id`
- `priority`
- `purpose`
- `setup`
- `steps`
- `expected`
- `notes`

## Repository Layout
- `QA/smoketest.md`
  Master QA rules and reporting contract.
- `QA/flows/*.md`
  One canonical user journey per file. Keep these stable.
- `QA/issues/*.md`
  Human-readable debugging records and issue logs. Do not mix these into the flow files.

## Logging Rules
- Do not append historical failures to the flow definition files.
- Keep flow files as the source of truth for expected behavior.
- Log findings in `QA/issues/` instead.
- Prefer one issue file per bug or one dated run log per QA pass.

## Recommended Issue Filename Patterns
- Single bug: `QA/issues/bug-search-poor-things-no-results.md`
- QA run log: `QA/issues/run-2026-04-10.md`
