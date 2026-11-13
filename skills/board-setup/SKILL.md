---
name: board-setup
description: >-
  Decide how nerdway signals status on this project's tracker, create the
  missing statuses, columns or labels with the user's consent, and record the
  map through bind-statuses. Reads board.rights, picks native / label /
  comment from the rights cascade, and never creates anything on a trial
  basis. Use for `/board-setup`, when the board lacks a phase (no In Review
  option, no status::* labels, no board column), or when the user asks to
  set up the board ("przygotuj tablicę", "dodaj statusy", "board setup",
  "create status labels").
---

# Board setup

One pass: **read platform → `board.rights` → pick the highest level the
rights allow → list what exists → propose the exact missing items in one
question → on an explicit yes, create them → re-read → bind through
`bind-statuses`**. A 403 on any write drops one cascade level, says so, and
asks again. Nothing is created on a trial basis.

This skill may run at any issue status: it writes tracker statuses, columns
or labels only after an explicit yes, and records the map through
`bind-statuses` (the user-owned nerdway config store, never a file in the
repo). The `board-setup` node is irreversible and sits behind a
chat-approval gate (`no-tracker-label-without-consent`).

## Adapters

```
${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory. Run an operation by its ID
from the adapter's `## Operations` table; a command of `—` means the tracker
cannot do it — skip that step, never improvise a command. The cascade
decision matches `scripts/lib/board-rights.ts` (`decideLevel`, `dropLevel`).

## Cascade

Three levels, highest first:

| Cascade level | Meaning | Status strategy that `bind-statuses` records |
|---------------|---------|----------------------------------------------|
| `native` | the board can be edited | `native`, except GitLab: strategy stays `label` (board columns are label lists) |
| `label` | labels or tags can be created | `label` |
| `comment` | neither | `comment` (`Status: <phase>` markers) |

`decideLevel({ native, label, reason })` picks the first level whose right
is `yes`. A right of `unknown` proposes that level and sets `uncertain`, so
this skill asks. `comment` is always available. A 403 on write calls
`dropLevel` and `decideLevel` again with that floor — it never climbs back.

## Step 1 — Read the platform

Take the platform from the caller when one was passed, else read it exactly
as `determine-platform` Step 1 does: the user nerdway config, read from disk
as `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes, else `platform:`
on the entity page.

- No platform → stop: "no platform configured — run `/determine-platform`".
- `tracker: none` → stop: "no tracker, nothing to set up".
- No adapter file for the tracker → stop: "adapter `trackers/<tracker>` is
  not available yet in this plugin version".

Note the current `statuses` block, if any, and the adapter's `## Statuses`
default and `## Status strategies` table (a strategy whose read and write
are `—` is unsupported).

**Azure DevOps Boards (`tracker: ado`).** If `ado.team`, `ado.board` and
`ado.workItemType` are not yet set, pick them the way `bind-statuses` Step 1
does (`team.list`, the board recipe, the type keys) before Step 2 — native
rights are team-admin of that team.

**GitHub Issues (`tracker: github`).** If `github.project` is unset, list
the owner's Projects (`gh project list --owner <github.owner> --format json
--limit 100` in the adapter's `## CLI`). One project → take its `number`.
Several → ask which one, recommending the one whose title matches the repo.
None → `native` cannot run; Step 3 will fall through. Record the number
before Step 2 so `board.rights` can read `viewerCanUpdate`. `--keys github`
replaces the whole `github` object, so pipe `owner`, `repo` and `project`
together:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/write-platform-config.ts" --repo "$(git rev-parse --show-toplevel)" --keys github
```

## Step 2 — Read rights

Run `board.rights`. The result is `{ native: yes|no|unknown, label:
yes|no|unknown, reason }`. A command of `—` still yields that shape from
the Notes column (Jira: `native` unknown, `label` no; Linear: `label` no).

Never probe rights by attempting a write.

## Step 3 — Pick the level and say so

Call `decideLevel` on the rights (floor `native` on the first pass).

- `uncertain: true` → ask one question: "I cannot tell whether you can
  edit the board (`native`) / create labels (`label`): `<reason>`. Can
  you?" Yes treats that right as `yes`; no treats it as `no`. Re-run
  `decideLevel`.
- Report the detected level and the reason in one sentence before asking
  to create anything, e.g. "Detected level: `native` (`viewerCanUpdate`
  true on project 1)." or "Detected level: `comment` (no board or label
  rights)."

A strategy the adapter lists as `—` is not a cascade level: if `decideLevel`
returns `label` and the adapter has `label` as `—` (Linear, Jira), drop to
`comment` and say so.

**GitLab.** Cascade `native` still records `strategy: label`. The create
step adds `status::*` labels and a board list per label.

## Step 4 — List what exists

| Cascade level | Operation | Use |
|---------------|-----------|-----|
| `native` | `status.list` | existing state / column / Status option names. Linear: `status.list` is `—`, so compare against the adapter default map and what the user confirms. GitLab: `label.list` plus the project's boards (`glab api …/boards`) |
| `label` | `label.list` | existing labels, to reuse before creating |
| `comment` | — | nothing to list or create |

When the operation is `—` and this is not the Linear/Jira guided path, say
so and skip to Step 7 with the adapter default map.

## Step 5 — Propose the missing items (one question)

Build the recommended map for the chosen strategy (same rules as
`bind-statuses` Step 4: adapter default, adjusted to names `status.list` /
`label.list` returned; Jira grouped by `statusCategory.key`; GitHub
`native` uses the project's Status option names, typically `Todo` /
`In Progress` / `Done` plus missing `Backlog` and `In Review`).

List every name the map needs that the tracker does not yet have, and
where it sits on the board:

- GitHub `native` — Status options to add, e.g. `Backlog` (GRAY) before
  `Todo`, `In Review` (YELLOW) after `In Progress`.
- Linear `native` — workflow states to add, with the team workflow URL
  from the adapter.
- GitLab — `status::*` labels, then a board list per label on the chosen
  board.
- Azure DevOps `native` — columns with the state each maps and its place,
  e.g. `Todo` (state `New`, after `New`), `In Review` (state `Active`,
  after `Active`).
- Jira `native` — status names to add, with the workflow editor URL from
  the adapter.

None missing → skip Step 6, go to Step 7.

Cascade `comment` → skip Step 6: create nothing, say so, go to Step 7
with `strategy: comment` and each phase mapping to itself.

Ask **one** question in plain chat naming every missing item and the
level, e.g.:

```
Detected level: native (viewerCanUpdate true on project 1).

Add these Status options to GitHub Project 1?
  - Backlog (GRAY), before Todo
  - In Review (YELLOW), after In Progress

Answer yes to create them, or name another level (label / comment).
```

Loop on corrections until the user confirms. A refusal to create, or a
request for a lower level, re-runs from Step 3 with that floor. Never
create without an explicit yes. This is the `no-tracker-label-without-consent`
rule.

## Step 6 — Create (only on yes)

On an explicit yes, run `status.create` (and `label.create` where the
adapter's recipe says so) once per missing item. GitLab: `label.create`
then the board-list recipe. Azure DevOps: the add-columns recipe, all
new columns in one `PUT`. GitHub: the Status-option create recipe,
including the item-Status snapshot, verify, and re-apply.

**Guided path** (Linear `status.create` is `—`; Jira `status.create` is
`—`): list the missing names, print the editor URL from the adapter, ask
the user to add them, wait, then re-run `status.list` (Linear: ask the
user which names they added). No GraphQL `workflowStateCreate`, no Jira
REST mutation, no stored token.

**HTTP 403** (or "you cannot edit this workflow"): stop the write, call
`dropLevel` on the current level, tell the user ("403 on native write —
dropping to `label`"), and go back to Step 5 for the new level. Do not
retry the failed write. Do not skip a level.

Re-read (`status.list` / `label.list`). A GitHub snapshot mismatch after
re-apply is a failure — stop and report it; do not bind a broken board.

## Step 7 — Bind the map

Invoke `nerdway:bind-statuses` and pass it the platform, the chosen
strategy, and the recommended map. It is mapping only: it writes the
`statuses` key (and on Azure DevOps the `ado` board keys) and does not
create statuses, columns or labels. When it stops, carry on: without a
`statuses` block the adapter default applies.

## Step 8 — Return the result

Print the detected level and reason, what was created (or that nothing
was), the full platform YAML `bind-statuses` returned, and where it was
written. A calling skill takes the statuses from this output, or reads
the store again as `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes.

## Boundaries

- Never write platform metadata into the repository. Config writes go
  through `write-platform-config.ts` (this skill: the `github` object when
  it records `github.project`) and through `bind-statuses` (the `statuses`
  key, plus `ado.team` / `ado.board` / `ado.workItemType`).
- The only tracker writes are `status.create` and `label.create`, each
  after an explicit yes. Never change an issue's state, labels or comments
  here. Never migrate historical issues between strategies.
- Never invent a Linear `workflowStateCreate` call or a Jira workflow REST
  write.
- Vault access goes through the filesystem by default; an MCP server is the
  transport only where the vault filesystem is absent (ADR-0010). Never git
  against the vault (ADR-0004).

## Related skills

- `nerdway:bind-statuses` — mapping only; this skill hands it the strategy
  and map after the board is ready.
- `nerdway:determine-platform` — records `github.project` when the repo
  uses a Project; run it first when no platform is configured.
- `nerdway:issue-workflow`, `nerdway:issue-start`, `nerdway:issue-close`,
  `nerdway:project-continue` — read and write phases through the strategy
  `bind-statuses` recorded.
- `nerdway:nerdbrain-wiki` — the write procedure for the entity-page
  mirror (used by `bind-statuses`).
