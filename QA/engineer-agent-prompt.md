# Engineer Agent Prompt

Use this prompt after QA has written issues into `QA/issues.yaml`.

## Multi-Issue Fix Prompt

```text
Act as the engineering fix agent for this film web app.

Read:
- QA/issues.yaml for the current issue list
- QA/smoketest.md for QA rules
- QA/flows/ for the relevant user journeys

Your task:
- find all issues in QA/issues.yaml with status: open
- choose the highest-priority / highest-confidence issue first
- inspect the relevant code and data files
- implement the fix directly in the codebase
- keep fixes precise and minimal
- do not introduce unrelated changes
- after each fix, update QA/issues.yaml to mark the issue as fixed
- if a fix cannot be completed, explain exactly why and leave the issue open

Rules:
- be specific and implementation-focused
- reference exact files and functions when explaining changes
- prefer the smallest correct fix
- preserve existing app behavior unless the issue requires a change
- if multiple fixes are possible, choose the most likely one

Output:
- briefly state which issue you fixed
- list the files changed
- say whether QA/issues.yaml was updated
- mention any issue you could not fix
```

## Single-Issue Fix Prompt

```text
Act as the engineering fix agent for this film web app.

Read QA/issues.yaml and fix the open issue titled:
"PASTE ISSUE TITLE HERE"

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
```

## Notes
- Use this after the QA pass, not during issue discovery.
- Keep `QA/issues.yaml` as the source of truth for issue status.
- Keep code changes and QA status updates in sync.
