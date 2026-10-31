# Host adapter: Grok Bot

Selected by host `grok-bot`: this session is the Grok Bot runtime, which has
a native ask/widget (`SendToUser` or equivalent). Interactive
`issue-workflow` uses that widget after posting a plan. `auto-issue-mode`
does not read this file.

## Detection

First match wins, same spirit as grill's ask-tool list. This file is selected
when:

1. `NERD4RENT_HOST` or `AGENT_HOST` is `grok-bot`; or
2. the session's tool list includes `SendToUser` (any case or
   `send_to_user` spelling), or another native widget ask whose name is
   that tool; or
3. `GROK_BOT` is set in the environment.

A session that also has `AskUserQuestion` or `AskQuestion` still stays
`grok-bot` when any of the signals above matched first.

## Operations

| Operation | Recipe | Notes |
|-----------|--------|-------|
| `host.detect` | recipe 1 below | returns `grok-bot` when this adapter's Detection signals match |
| `post-plan.after-plan` | recipe 2 below | interactive `issue-workflow` only; AIM never runs this |

### Recipe 1: `host.detect`

Look at this session only: the environment, then the tool list. Do not read
the platform config. The ordered probe lives in the calling skill and in
`scripts/lib/host-detect.ts`; this row is the `grok-bot` arm of that probe.

### Recipe 2: `post-plan.after-plan`

The `## Implementation plan` comment is already on the tracker and the
phase is `todo`. Ask whether to implement, with the host's native
ask/widget (`SendToUser` or the equivalent widget tool in this session).
The question is one decision. The two options, in this order, with these
labels:

1. **Implementuj teraz** — write `in-progress` with `issue.set-status` and
   continue Start (the same unlock an explicit `zaimplementuj` gives).
2. **Później** — stop. Leave the phase `todo`. Do not write `in-progress`.
   Do not Start, do not edit the repo.

If the native widget is missing after detect still chose this host, ask the
same two options as a numbered list. "1" or "tak" picks Implementuj teraz.
A synthetic host skip (`Questions skipped by the user`, no other user text)
is not an answer: re-ask as the numbered list; do not invent a choice.
