# Host adapters as a fourth axis for post-plan behaviour

*Amended by ADR-0013 (DEMO-481): `nerd-orchestrate` reuses `host.detect` for AIM dispatch and does not add an `orchestrate.parallel` operation; see ADR-0013.*

Interactive `issue-workflow` used one host-agnostic close of the planning
turn: stop, write `todo`, and ask the human to move the issue to
`in-progress` in the shape *Asking the human to move a phase*
(`adapters/statuses.md`). That is right on Claude Code and Cursor, where
the next turn starts after the human flips the status. On Grok Bot there
is no managed multi-turn context after that stop, so the same prose leaves
the user without a way to continue from the widget they already have.

We add a fourth adapter axis, `adapters/hosts/<id>.md`, selected by a
**runtime detect**, not by the `## Platform` section of `CLAUDE.md`. A
repository does not know which agent host will open it. The selector enum
is `Host.id` (`grok-bot`, `claude-code`, `cursor`), so rule 24 holds the
same way the vault axis uses `EntityPageUpdate.tier` outside
`PlatformConfig` (ADR-0005 / DEMO-454).

This issue covers **post-plan behaviour only**. After the skill posts a
`## Implementation plan` comment and writes `todo`:

- **Grok Bot** asks with the native host ask/widget (`SendToUser` or
  equivalent). Options: **Implementuj teraz** (write `in-progress` with
  `issue.set-status` and continue Start) / **Później** (stop, leave
  `todo`).
- **Claude Code** and **Cursor** keep the 0.73.0 prose path.

The detect heuristic looks at this session's environment and tool list,
in the same spirit as grill's ask-tool selection (ADR-0011). First match
wins; a session that matches nothing uses `claude-code` (the prose
fallback). `auto-issue-mode` does not read this axis: it still writes
`in-progress` itself after the plan on every host.

The plan hard gate (OPS-23) is unchanged: no Start, no repo edit, no
CloudAgent without a comment whose first heading is
`## Implementation plan`.

## Considered Options

- **Keep one host-agnostic post-plan close** — rejected: Grok Bot needs
  the widget, and folding that into the shared skill would either change
  Claude Code / Cursor or hide a host branch in untestable prose.
- **A host field on `## Platform` / `PlatformConfig`** — rejected: the
  host is a property of the running session, not of the repository. Vault
  already showed that an axis selector may live outside the platform
  config.
- **Separate issue-workflow skills per host** — rejected: the dispatch,
  the plan gate and the implementation phase stay shared; only the end of
  the planning turn differs.
- **Let auto-issue-mode read `hosts/`** — rejected: AIM's consent model
  is the invocation itself. It writes `in-progress` after the plan on
  every host and must not start asking.
- **A hosts axis with detect + after-plan only** — chosen: rule 24 needs
  a complete Operations table on every adapter file. The two operation
  IDs are identical across the three hosts. Islands, native ask outside
  post-plan, and a wider host contract stay out of scope.

## Consequences

- `workflow-graph.json` gains a `hosts` axis (`config: Host.id`, sections
  `Detection` and `Operations`, operations `host.detect` and
  `post-plan.after-plan`) and a `Host` registry schema. `plan-draft`
  names the axis in `adapters`. Rule 24/26 apply unchanged.
- `issue-workflow` runs `host.detect` then `post-plan.after-plan` at the
  end of a planning turn that posted the plan. Claude Code and Cursor
  behaviour is the 0.73.0 prose path.
- `auto-issue-mode` does not mention `adapters/hosts/`.
- A later issue may widen the axis (islands, ask). Adding an operation
  ID then is a contract change on every host file, which is the point of
  the axis.
