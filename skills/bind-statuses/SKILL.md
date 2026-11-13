---
name: bind-statuses
description: >-
  Bind the five canonical workflow phases (backlog, todo, in-progress,
  in-review, done) to how the project's tracker shows them — a status strategy
  (native states, labels plus open/closed, or `Status:` marker comments) and a
  phase → value map — and record it as the `statuses` key of the user-owned
  nerdway platform config, mirrored on the nerdbrain entity page. Lists
  the tracker's real states or labels where its CLI can, recommends a map.
  Mapping only: creating missing statuses, columns or labels is
  `board-setup`. Use for `/bind-statuses`, at the end of
  `determine-platform` or `board-setup`, or when the user asks how
  workflow statuses map to the tracker ("zmapuj statusy", "powiąż
  statusy", "bind statuses", "status labels").
---

# Bind statuses

One pass: **read → propose strategy → list → propose map (ask) → write
both places → validate → return**. The result is the `statuses` block of
the `PlatformConfig` schema in `workflow-graph.json`. What each strategy
means lives in `${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` — read it
first. Creating missing statuses, columns or labels is `board-setup`;
this skill maps names that already exist. When the caller (`board-setup`)
passes a strategy and map, use those as the recommendation in Step 2 and
Step 4.

This skill may run at any issue status: it writes only the user-owned nerdway
config store (the `statuses` key, and on Azure DevOps Boards the `team`,
`board` and `workItemType` keys of the `ado` block) and the entity-page
mirror, never a file in the repo.

## Adapters

```
${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory. Run an operation by its ID
from the adapter's `## Operations` table; a command of `—` means the tracker
cannot do it — skip that step, never improvise a command.

## Step 1 — Read the platform

Take the platform from the caller when one was passed (the
`determine-platform` chain passes its result), else read it exactly as
`determine-platform` Step 1 does: the user nerdway config, read from disk as
`${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes, else `platform:` on the
entity page.

- No platform → stop: "no platform configured — run `/determine-platform`".
- `tracker: none` → stop: "no tracker, nothing to bind".
- No adapter file for the tracker → stop: "adapter `trackers/<tracker>` is not
  available yet in this plugin version".

Note the current `statuses` block, if any, and the adapter's `## Statuses`
default and `## Status strategies` table (a strategy whose read and write are
`—` is unsupported).

**Azure DevOps Boards (`tracker: ado`) — pick the board first.** Its `native`
values are the columns of one team's board, so settle `ado.team`, `ado.board`
and `ado.workItemType` before Step 2, keeping values the block already holds:

1. `team.list`; one team → take it, several → ask which one.
2. The team's boards (the board recipe of the adapter, without `id`); ask
   which one when there are several, recommending the lowest backlog level
   (`Stories`, `Backlog items`, `Issues`).
3. The board recipe with `id`: the keys of the columns' `stateMappings` are
   the types the board carries; one → take it, several → ask which one new
   issues are created as.

**Jira Cloud (`tracker: jira`).** `native` maps phases to the project's
workflow status names as the site spells them (often not English). Do
**not** add statuses or edit the board here — that is `/board-setup`.
Run `status.list`: unique `fields.status.name` values
with `fields.status.statusCategory.key` (`new`, `indeterminate`, `done`).
Propose a native map by category (`new` → `backlog` and `todo`;
`indeterminate` → `in-progress` and `in-review`; `done` → `done`). Ask
when a category has several names or when five distinct names cannot be
filled. Never assume English names such as `In Progress` or `To Do`. If
the five phases cannot be bound natively, recommend `comment` with
`Status: <phase>` markers. Never offer `label` (the adapter lists it as
`—`).

## Step 2 — Propose a strategy

Pick the recommendation by the first rule that holds:

1. An existing `statuses` block whose strategy the adapter supports → keep it.
2. The adapter supports `native` → `native`.
3. The adapter supports `label` → `label`.
4. Otherwise → `comment`.

`comment` is also the answer when the user turns down `label` (no label
rights, or no wish to add labels). Never offer a strategy the adapter lists as
`—`.

## Step 3 — List what the tracker has

| Strategy | Operation | Use |
|----------|-----------|-----|
| `native` | `status.list` | the tracker's state names (on Azure DevOps: the board's columns) |
| `label` | `label.list` | existing labels, to reuse before creating |
| `comment` | — | nothing to list; markers need no setup |

When the operation is `—`, say so and propose the adapter default map
instead. On Linear, `status.list` probes the five default names.

## Step 4 — Propose the map (one question)

Build the recommended map:

- `native` — the existing map, else the adapter default, adjusted to the names
  `status.list` returned when it ran. On Jira Cloud ignore English example
  names unless `status.list` actually returned them; group by
  `statusCategory.key` and ask when a category is ambiguous. On Azure DevOps a
  board with fewer than five columns cannot hold the map: stop and ask the
  user to run `/board-setup`, which adds the missing columns. On GitHub
  `native`, Status options the map needs that `status.list` did not return
  are created by `/board-setup`, not here.
- `label` — `backlog: open`, `todo: status::todo`,
  `in-progress: status::in-progress`, `in-review: status::in-review`,
  `done: closed`; reuse an existing label that clearly means the same phase.
- `comment` — each phase maps to itself (`in-progress: in-progress`).

Ask **one** question in plain chat with the strategy, the map as YAML and the
reason for the recommendation, e.g.:

```
Bind the workflow phases like this? (recommended — Linear supports native states; this is the adapter default)

strategy: native
map:
  backlog: Backlog
  todo: Todo
  in-progress: In Progress
  in-review: In Review
  done: Done

Answer yes, name another strategy (native / comment), or edit the map.
```

Loop on corrections until the user confirms. Every phase gets a value, no
value twice, no quote, backtick, `$` or backslash in a value (recipes put it
into shell commands), `open`/`closed` only under `label` (`done: closed`
always there, `open` only for `backlog`) — `adapters/statuses.md` has the
reasons.

## Step 5 — Missing names point to `board-setup`

List the confirmed map values that `status.list` / `label.list` did not
return (never `open`/`closed`). None missing → go to Step 6. Otherwise
stop and tell the user to run `/board-setup`, which creates missing
statuses, columns or labels with consent, then come back here. Offer
`comment` if they cannot or will not change the board. Do not run
`label.create` or `status.create` from this skill.

When `label.create` is `—` because the tracker creates a tag on first use
(Azure DevOps tags) and the cascade is `label`, the map may be written;
the first `issue.set-status` of each phase creates its tag. That is not
a board-column write.

## Step 6 — Write both places

**User nerdway config** — write through the script, never by editing a repo
file. Pipe a YAML object that holds only `statuses` (and on Azure DevOps
also `ado` with `team`, `board` and `workItemType`) to:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/write-platform-config.ts" --repo "$(git rev-parse --show-toplevel)" --keys statuses,ado
```

Shape of `statuses`:

```yaml
statuses:
  strategy: native
  map:
    backlog: Backlog
    todo: Todo
    in-progress: In Progress
    in-review: In Review
    done: Done
```

Phases in this order, two-space indentation, values unquoted unless they
start with a YAML special character. The script merges those keys into the
project config and leaves every other key as it is.

Running the skill twice with the same answers must leave the config file
unchanged.

**Entity page** — only when the vault is reachable (`tier=file`) and the page
exists: set `platform.statuses` (and `platform.ado`'s three keys) in the frontmatter to the same object,
following `nerdway:nerdbrain-wiki` (filesystem only, `updated:` bump, one
`log.md` line). Nothing else on the page changes. Skip silently otherwise.

## Step 7 — Validate

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-platform-config.ts" --print "$(git rev-parse --show-toplevel)"
```

Non-zero exit → show the errors, fix the object with the user, write again.

## Step 8 — Return the result

Print the full platform YAML and where it was written (or that nothing
changed). A calling skill takes the statuses from this output, or reads the
store again as `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes.

## Boundaries

- Never write platform metadata into the repository. The only config writes
  are the `statuses` key (plus `ado.team`, `ado.board`, `ado.workItemType` on
  Azure DevOps) through `write-platform-config.ts`, and the entity-page
  mirror.
- No tracker writes from this skill: creating statuses, columns or labels
  is `board-setup`. Never change an issue's state, labels or comments here.
- Vault access goes through the filesystem by default; an MCP server is the
  transport only where the vault filesystem is absent (ADR-0010). Never git
  against the vault (ADR-0004).

## Related skills

- `nerdway:determine-platform` — chains here once the platform is recorded.
- `nerdway:board-setup` — creates missing statuses, columns or labels, then
  chains here with the strategy and map.
- `nerdway:issue-workflow`, `nerdway:issue-start`, `nerdway:issue-close`,
  `nerdway:project-continue` — read and write phases through the strategy
  this skill binds.
- `nerdway:nerdbrain-wiki` — the write procedure for the entity-page mirror.
