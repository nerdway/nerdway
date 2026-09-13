# Canonical phases and status strategies

The issue lifecycle used to be steered by Linear's own state names: skills
compared `state.name` with `Todo`, `In Progress`, `In Review`, `Done`, and an
older workflow approved a plan with a `Status: approved` comment line. Trackers
without per-team states (GitHub Issues, GitLab Issues) or with a different
state model (Azure DevOps Boards) cannot answer that question the same way.
We make the core skills operate on **five canonical phases** —
`backlog`, `todo`, `in-progress`, `in-review`, `done` — and move the question
"how does this tracker show a phase" into a **status strategy** chosen per
project:

- `native` — the tracker's own state field; the map holds state names.
- `label` — one label per phase plus the issue's open/closed flag; the map
  holds label names, and the reserved values `open` and `closed`.
- `comment` — the newest comment whose first line is `Status: <value>`; the
  map holds marker values.

The strategy and its **status map** (phase → value) are an optional
`statuses` block of the platform config, written by the `bind-statuses`
skill. With no block, the tracker adapter's `## Statuses` default applies —
`native` with `Backlog / Todo / In Progress / In Review / Done` on Linear — so
every existing project behaves exactly as before, with no migration. The
operation IDs stay the same: `issue.read-status` and `issue.set-status` now
mean "read / write the phase through the configured strategy", and each
tracker adapter lists its recipe per strategy in a `## Status strategies`
table, with `—` for a strategy it does not support. What the three strategies
mean independently of any tracker lives once, in `adapters/statuses.md`.

The human approval gate does not depend on the strategy: only the human moves
an issue to `in-progress` — a state change, a label, or a marker comment —
and the agent writes that phase only on an explicit instruction in chat. The
legacy `Status: approved` marker is removed rather than aliased: the
`comment` strategy is its general form.

## Considered Options

- **Keep Linear state names in the skills and translate per tracker inside
  each skill** — rejected: the N skills × M trackers duplication ADR-0005
  removed for commands would come back for states.
- **New operation IDs per strategy** (`issue.read-label-status`,
  `issue.read-comment-status`, …) — rejected: every skill would branch on the
  strategy, and adding a strategy would touch every skill instead of every
  adapter.
- **A mandatory `statuses` block** — rejected: it forces a migration of every
  existing `## Platform` section for a value the adapter already knows.
- **Only `native` and `label`** — rejected: a tracker where the user cannot or
  will not create labels would have no way to carry the gate; `comment` works
  wherever comments do.
- **A nested map per strategy** (`native: {…}`, `label: {…}`) — rejected: a
  project uses one strategy at a time, so a flat phase → value map with
  per-strategy value rules is enough.
- **Keeping `Status: approved` as an alias of `in-progress`** — rejected: two
  markers for one phase, one of them invisible in the status map.

## Consequences

- The platform config is validated in two layers. The contract
  (`scripts/validate-workflow-graph.ts`, rule 25) checks that every tracker
  adapter lists exactly the strategies of the `PlatformConfig` enum in
  `## Status strategies`, supports at least one, and gives a read and a write
  recipe for each one it supports. A real config is checked by
  `scripts/validate-platform-config.ts`: all five phases mapped, a known
  strategy the adapter supports, no value mapped twice, no quote, backtick,
  `$` or backslash in a value (adapter recipes interpolate it into shell
  commands), `open`/`closed` only under `label` — and every tracker adapter's own default the same way.
- Writing the `statuses` key of `## Platform` is a second exemption on
  `no-repo-change-before-in-progress`, held by the `statuses-bind` node.
  Creating a missing label on the tracker is irreversible outward-facing work,
  so it sits behind a new frozen rule, `no-tracker-label-without-consent`,
  with a chat-approval gate.
- An unmapped tracker value (a Linear `Canceled` state, an unknown marker) is
  "phase unknown": the skill reports it and dispatches nothing.
- Under `comment`, a marker is only counted as a standalone first line of a
  comment, so a quoted marker inside prose never moves an issue; any author's
  marker counts, since a solo developer writes as the same account the agent
  uses. That holds only where outsiders cannot comment: an adapter for a public
  tracker must restrict markers to users with write access or not offer
  `comment`.
- `determine-platform` chains into `bind-statuses`, and `bind-statuses` also
  runs on its own at any time; both keep an existing `statuses` block when
  they rewrite the section.
