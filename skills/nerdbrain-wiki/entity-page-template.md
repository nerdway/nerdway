---
type: entity
subtype: project
tags: [project]
created: YYYY-MM-DD
updated: YYYY-MM-DD
slug: <slug>
remote: <git-remote-url-or-empty>
local-paths:
  - {host: <hostname>, path: <absolute-path>}
linear:              # REQUIRED — never leave empty or placeholder
  team: <team-key>   # from `linear teams list` (e.g. DEMO)
  project: <uuid>    # `id` from `linear projects list --team <key> -o json`
# If the project has no Linear counterpart, replace the whole block with:
# linear: none
related: []
---

# <slug>

## Purpose
One to three sentences: what it is, who it serves, what problem it solves.

## Stack
- Language: ...
- Framework: ...
- DB / infra: ...
- Key libraries: ...

## Commands
- Build: `...`
- Test: `...`
- Run dev: `...`
- Deploy: `...`

## Conventions
Project-specific patterns not obvious from code.

## Gotchas
Foot-guns, surprising behavior, "looks like X but isn't".

## Decisions
- `YYYY-MM-DD` — decision + reason (+ Linear/issue link if applicable)

## Active context
What is happening now, deadlines, freeze windows, who to ask.
Flag staleness when updated > 14 days ago.

## References
- Issue tracker (Linear / Jira / GitLab): ...
- Slack / Teams channel: ...
- Runbook / dashboard: ...
