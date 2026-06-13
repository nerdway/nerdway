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
linear:
  team: <team-key>
  project: <uuid>
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
