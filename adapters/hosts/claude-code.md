# Host adapter: Claude Code

Selected by host `claude-code`: this session is Claude Code (or the
fallback when no host signal matched). After posting a plan, interactive
`issue-workflow` stops and asks the human to move the phase, as in 0.73.0.
`auto-issue-mode` does not read this file.

## Detection

First match wins, same spirit as grill's ask-tool list. This file is selected
when:

1. `NERD4RENT_HOST` or `AGENT_HOST` is `claude-code`; or
2. no earlier host matched, and the session's tool list includes
   `AskUserQuestion`; or
3. no earlier host matched, and `CLAUDE_CODE` or `CLAUDECODE` is set; or
4. no host signal matched at all (the prose fallback).

`grok-bot` wins over this file when its signals matched first.

## Operations

| Operation | Recipe | Notes |
|-----------|--------|-------|
| `host.detect` | recipe 1 below | returns `claude-code` when this adapter's Detection signals match, including the empty-signal fallback |
| `post-plan.after-plan` | recipe 2 below | interactive `issue-workflow` only; AIM never runs this |

### Recipe 1: `host.detect`

Look at this session only: the environment, then the tool list. Do not read
the platform config. The ordered probe lives in the calling skill and in
`scripts/lib/host-detect.ts`; this row is the `claude-code` arm of that
probe, and the fallback when nothing matched.

### Recipe 2: `post-plan.after-plan`

The `## Implementation plan` comment is already on the tracker and the
phase is `todo`. Stop here: report that the plan is on the tracker. Ask
for the move to `in-progress` in the shape *Asking the human to move a
phase* in `adapters/statuses.md`, and do **not** write `in-progress`
yourself. Do not Start, do not edit the repo. An implement command that
arrived **without** a plan does not unlock Start on this turn.
