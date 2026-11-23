# Host adapter: Claude Code

Selected by host `claude-code`: this session is Claude Code (or the
fallback when no host signal matched). After posting a plan, interactive
`issue-workflow` stops and asks the human to move the phase, as in 0.73.0.
`auto-issue-mode` does not read this file.

## Detection

First match wins, same spirit as grill's ask-tool list. This file is selected
when:

1. `NERDWAY_HOST` or `AGENT_HOST` is `claude-code`; or
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
| `workstation.exec` | recipe 3 below | the session's own shell on a local session; `—` on a cloud session (`CLAUDE_CODE_REMOTE=true`) |

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

### Recipe 3: `workstation.exec`

A local Claude Code session already runs on the user's workstation: run the
command with the session's shell tool, as any other command. A cloud session
(`CLAUDE_CODE_REMOTE=true`) has no way to reach a workstation, so the
recipe is `—` there and the write is queued on the issue.

Run the three steps of a guide or Checkpoints write on the same machine:
the live-wiki probe (`node <plugin dir>/scripts/resolve-vault.ts --json --host <host>`,
`live` must be `true`), the write, then
`node <plugin dir>/scripts/verify-vault-file.ts <WIKI> <path> --contains <issue URL>`.
