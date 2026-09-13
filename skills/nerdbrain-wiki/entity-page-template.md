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
platform:            # REQUIRED — same object as the repo CLAUDE.md `## Platform` section
  tracker: linear    # linear | github | gitlab | ado | none
  vcs: github        # github | gitlab | ado
  linear:            # identifier block of each platform in use
    team: <team-key>
    project: <uuid>
  github:
    owner: <owner>
    repo: <repo>
# No tracker: `tracker: none` and no `linear:` block inside `platform:`.
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

## Checkpoints
- YYYY-MM-DD — <ISSUE-ID> · <Linear status> · <branch> @ <7-char HEAD> — next: <one line>

## Active context
What is happening now, deadlines, freeze windows, who to ask.
Flag staleness when updated > 14 days ago.

## References
- Issue tracker (Linear / Jira / GitLab): ...
- Slack / Teams channel: ...
- Runbook / dashboard: ...
