# Status strategies

What the three status strategies mean on any tracker. A tracker adapter's
`## Status strategies` table gives the commands; this file gives the rules
those commands follow. Background: ADR-0006.

## Canonical phases

Core skills dispatch on five phases, never on a tracker's own state names:

| Phase | Meaning | Who writes it |
|-------|---------|---------------|
| `backlog` | filed, not planned yet | `issue-writer` on create |
| `todo` | the implementation plan is posted | `issue-workflow` after posting the plan |
| `in-progress` | the human approved the plan | **the human only** — the agent writes it only on an explicit instruction in chat |
| `in-review` | the change is up for code review | the human, or the agent when asked |
| `done` | merged or closed | `issue-close` |

## Resolving the strategy and map

1. The `statuses` block of the platform config (`## Platform` in the repo
   `CLAUDE.md`, else `platform:` on the entity page), when present.
2. Otherwise the tracker adapter's `## Statuses` default.

Both hold the same shape:

```yaml
strategy: native
map:
  backlog: Backlog
  todo: Todo
  in-progress: In Progress
  in-review: In Review
  done: Done
```

`issue.read-status` and `issue.set-status` run the read and write recipe of
the resolved strategy from the adapter's `## Status strategies` table. A
strategy whose recipes are `—` is not supported by that tracker: stop and
report "strategy `<strategy>` is not supported by `trackers/<tracker>` — run
`/bind-statuses`".

## Reading a phase back

The recipe yields a **value**; the phase is the map key holding that value.

- Exactly one key holds it → that phase.
- No key holds it (a Linear `Canceled` state, a label nobody mapped) →
  **phase unknown**: report the raw value and dispatch nothing. Never guess
  the nearest phase.

## `native`

The tracker's own state field.

- **Map values:** state names exactly as the tracker spells them.
- **Read:** the issue's current state name.
- **Write:** set the state to `map[<phase>]`.

## `label`

One label per phase, plus the issue's open/closed flag.

- **Map values:** label names (convention `status::<phase>`), or the reserved
  values `open` and `closed`. `done` is always `closed`, so a merge that
  auto-closes the issue lands on `done` without a label. `open` may only map
  `backlog`.
- **Read:**
  1. issue closed → `done`;
  2. open with exactly one mapped label → that label's phase;
  3. open with no mapped label → `backlog` when `map.backlog` is `open`,
     otherwise phase unknown;
  4. open with two or more mapped labels → report the conflict, dispatch
     nothing.
- **Write** `<phase>`:
  - `closed` → close the issue; leave its labels;
  - `open` → remove every mapped label, reopen the issue when closed;
  - a label → remove every other mapped label, add this one, reopen the issue
    when closed.
- Labels are created only by `bind-statuses`, and only with the user's
  consent (`no-tracker-label-without-consent`).

## `comment`

A marker comment on the issue.

- **Map values:** marker values (convention: the phase itself,
  `in-progress`).
- **Marker:** a comment whose **first line** is exactly `Status: <value>`.
  A marker quoted inside prose, indented, or on a later line does not count.
  Any author counts.
- **Read:** the newest comment carrying a marker; its value is looked up in
  the map. No marker comment at all → `backlog`.
- **Write** `<phase>`: post a new comment whose body is the single line
  `Status: <map[phase]>`. Never edit or delete an earlier marker — the thread
  is the history.

## The approval gate, in every strategy

`in-progress` unlocks repo changes. It is written by the human — a state
change, a label, or a marker comment — and read by the agent at the start of
every turn. The agent writes `in-progress` itself only when the user says so
in chat, and then only to record that instruction.
