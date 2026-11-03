# nerd-orchestrate reuses host detect; parallel recipes stay in the skill

`nerd-orchestrate` has to branch on the running host when it dispatches
`auto-issue-mode`: Claude Code and Cursor may run at most two AIM subagents
in `git worktree` checkouts; Grok Bot stays sequential in the session or
launches a CloudAgent, and must not use local worktrees as a parallel path.
The hosts axis from ADR-0012 already has `host.detect`. Widening it with a
third operation, `orchestrate.parallel`, would be a contract change on every
`adapters/hosts/*.md` file (rule 24) for a recipe only this skill runs.

We keep the axis as detect + `post-plan.after-plan`. The orchestrator runs
`host.detect` (the same probe as `scripts/lib/host-detect.ts`), then follows
`scripts/lib/orchestrate-dispatch.ts` and the worktree / Grok Bot recipes in
`skills/nerd-orchestrate/reference.md`. Validators do not require a new
operation id for prose that reuses detect. The `nerd-orchestrate` node names
the `hosts` axis because it calls `host.detect`; it does not run
`post-plan.after-plan` (that ask would collide with "ask before AIM").
`auto-issue-mode` still does not read the axis.

The plan hard gate (OPS-23) is unchanged: no Start, no repo edit, no
CloudAgent, no AIM, without a comment whose first line is exactly
`## Implementation plan`.

## Considered Options

- **Add `orchestrate.parallel` to every host adapter** — rejected for this
  issue: ADR-0012 already said a later widening is a contract change on
  every host file, which is the point of the axis, but the graph validator
  does not require the id, and the recipe is unique to one conversational
  skill. Reuse detect until a second caller needs the same table.
- **Host-agnostic sequential AIM only** — rejected: Claude Code and Cursor
  can isolate two checkouts; the grill settled on max 2 worktrees there.
- **Local worktrees on Grok Bot too** — rejected: the default Grok Bot path
  has no isolated parallel checkouts in one cwd; sequential or CloudAgent
  is the isolation it already has.
- **Reuse `host.detect`, keep parallel recipes in the skill** — chosen.

## Consequences

- `workflow-graph.json` gains the `nerd-orchestrate` node (`runtime:
  conversational`, `phase: orchestrate`, `budget.maxWidth: 2`, `adapters:
  ["hosts"]`). The hosts operations list stays `host.detect` and
  `post-plan.after-plan`.
- A second skill that needs the same worktree-versus-sequential table
  should then add `orchestrate.parallel` on every host file, which is the
  widening ADR-0012 reserved.
- `auto-issue-mode` remains host-agnostic. Interactive `issue-workflow`
  still owns `post-plan.after-plan`.
