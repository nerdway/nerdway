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
   `CLAUDE.md`, read from disk as `adapters/platform.md` describes, else
   `platform:` on the entity page), when present.
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

An adapter names the field it treats as the state. On Azure DevOps Boards it
is the column of the team's board (the stock processes have too few states
for five phases): the map holds column names, and a write sets the column
together with the state that column maps.

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
  Any author counts — acceptable only where just project members can comment
  (a private Linear workspace). An adapter for a tracker where outsiders can
  comment (public GitHub or GitLab issues) must restrict its read recipe to
  markers from users with write access, or list `comment` as `—`.
- **Read:** the newest comment carrying a marker; its value is looked up in
  the map. No marker comment at all → `backlog`.
- **Write** `<phase>`: post a new comment whose body is the single line
  `Status: <map[phase]>`. Never edit or delete an earlier marker — the thread
  is the history.

## Asking the human to move a phase

When a skill's turn ends on a phase only the human moves, or a skill stops
because the issue is in the wrong phase, its message carries three parts, in
this order:

1. **What happened** — one line: the plan is posted, the start stopped, the
   merge failed.
2. **The phase the work waits for**, named by its map value `map[<phase>]`,
   never by the canonical phase name, and phrased for the resolved strategy:
   - `native` — "move the issue to `<value>`";
   - `label` — "add the label `<value>`" (for `closed`: "close the issue";
     for `open`: "remove the status labels");
   - `comment` — "post a comment whose first line is `Status: <value>`".
3. **The issue link** from `issue.url`.

A message that waits for no phase — a close-out report, a state report —
keeps parts 1 and 3.

The request is addressed to the human and grants the agent nothing: asking
for `in-progress` never lets the agent write it (the gate below).

## The approval gate, in every strategy

`in-progress` unlocks repo changes. It is written by the human — a state
change, a label, or a marker comment — and read by the agent at the start of
every turn. The agent writes `in-progress` itself only when the user says so
in chat, and then only to record that instruction.

## A done issue without a trace of work

An issue read back as `done` should have left work on the default
branch. When it has not, it was closed by mistake, and that is a bug in the
process, not a note for the issue thread.

**Detection.** After `git fetch`, search the history of the default branch
for the forms the workflow writes, with `<ID>` as the tracker adapter's
`## Issue ID` gives it:

```bash
git log origin/<default> --oneline -i -E \
  --grep '^<ID>:' \
  --grep '^Rozpoczęcie prac nad <ID>([^0-9]|$)' \
  --grep 'Fixes <ID>([^0-9]|$)' \
  --grep '\(<ID>\)'
git log origin/<default> --oneline -F --grep '<branch>'
```

The first command finds the PR/MR title (`<ID>: <title>`, kept in the merge
commit), the start commit, the `Fixes <ID>` line a squash merge keeps from
the PR/MR body, and a subject ending in `(<ID>)`. For `#<n>` IDs drop the
last pattern: GitHub appends `(#<PR>)` to squash-merged subjects, and PRs
share the issue numbers. The second finds the merge
commit of the issue's branch, `<branch>` from `issue.read-branch`. A bare
mention of the ID does not count: another issue's PR title naming it (a bug
about it, say) would hide the incident.

No hit from either command is a done issue without a trace of work. A parent
issue carries no work of its own: skip it and check its children
(`issue.read-relations`).

**Exception.** An issue closed on purpose with no code in this repo (a
duplicate, a decision, a spike, work done in another repo) carries a comment
whose first line is `## No code in this repo` and whose second line is
`Reason: <why>`, found in the comments `issue.read` returns. With that comment
the issue counts as done; nothing is reported. The human writes it when
closing such an issue.

**Consequence.** Every skill that reads issues (`project-continue`,
`issue-next-step`, the `issue-workflow` dispatch, a backlog review) does the
same:

1. warn in its report: the issue, the phase it is in, and that no commit on
   the default branch carries it;
2. propose a bug through `issue-writer`: what was found and how, the issue
   link, the expected state (work merged, or the exception comment), and a
   `related` relation to the issue (`issue.relate`), marked as a bug per the
   tracker adapter's `## Bugs`.

A comment on the faulty issue alone is never enough, and the skill never
moves the faulty issue's phase back: that is the human's call, made after
reading the bug.
