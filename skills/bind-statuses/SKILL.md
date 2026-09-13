---
name: bind-statuses
description: >-
  Bind the five canonical workflow phases (backlog, todo, in-progress,
  in-review, done) to how the project's tracker shows them — a status strategy
  (native states, labels plus open/closed, or `Status:` marker comments) and a
  phase → value map — and record it as the `statuses` key of the `## Platform`
  section in the repo CLAUDE.md, mirrored on the nerdbrain entity page. Lists
  the tracker's real states or labels where its CLI can, recommends a map,
  creates missing labels only with consent. Use for `/bind-statuses`, at the
  end of `determine-platform`, or when the user asks how workflow statuses map
  to the tracker ("zmapuj statusy", "powiąż statusy", "bind statuses", "status
  labels").
---

# Bind statuses

One pass: **read → propose strategy → list → propose map (ask) → (create
labels with consent) → write both places → validate → return**. The result is
the `statuses` block of the `PlatformConfig` schema in `workflow-graph.json`.
What each strategy means lives in `${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md`
— read it first.

This skill may run at any issue status: the `no-repo-change-before-in-progress`
rule exempts writing the `statuses` key of the `## Platform` section in the
repo `CLAUDE.md`. Touch nothing else in the repo.

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
`determine-platform` Step 1 does: the line-start `## Platform` section of the
repo `CLAUDE.md`, else `platform:` on the entity page.

- No platform → stop: "no platform configured — run `/determine-platform`".
- `tracker: none` → stop: "no tracker, nothing to bind".
- No adapter file for the tracker → stop: "adapter `trackers/<tracker>` is not
  available yet in this plugin version".

Note the current `statuses` block, if any, and the adapter's `## Statuses`
default and `## Status strategies` table (a strategy whose read and write are
`—` is unsupported).

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
| `native` | `status.list` | the tracker's state names |
| `label` | `label.list` | existing labels, to reuse before creating |
| `comment` | — | nothing to list; markers need no setup |

When the operation is `—` (Linear has no state-listing command), say so and
propose the adapter default map instead.

## Step 4 — Propose the map (one question)

Build the recommended map:

- `native` — the existing map, else the adapter default, adjusted to the names
  `status.list` returned when it ran.
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
value twice, `open`/`closed` only under `label` (`done: closed` always there,
`open` only for `backlog`) — `adapters/statuses.md` has the reasons.

## Step 5 — Create missing labels (label strategy only, with consent)

List the confirmed label values that `label.list` did not return (never
`open`/`closed`). None missing → skip. Otherwise ask, naming each label:
*"Create these labels on `<tracker>`: `status::todo`, …?"* Only on an explicit
yes run `label.create` once per label. On no, stop: the map cannot be written
while its labels do not exist — offer `comment` instead.

This is the `no-tracker-label-without-consent` rule: nothing is created on the
tracker without that yes.

## Step 6 — Write both places

**Repo `CLAUDE.md`** — edit the YAML block of the `## Platform` section:

1. Find the heading `## Platform` **at the start of a line**; never splice on
   a bare substring search.
2. Inside its fenced `yaml` block, replace the top-level `statuses:` key with
   all its indented lines, or append it at the end of the block when absent.
   Every other key stays byte-for-byte.
3. Shape:

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
   start with a YAML special character.

Running the skill twice with the same answers must leave `git diff` empty.

**Entity page** — only when the vault is reachable (`tier=file`) and the page
exists: set `platform.statuses` in the frontmatter to the same object,
following `nerd4rent:nerdbrain-wiki` (filesystem only, `updated:` bump, one
`log.md` line). Nothing else on the page changes. Skip silently otherwise.

## Step 7 — Validate

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-platform-config.ts "$(git rev-parse --show-toplevel)/CLAUDE.md"
```

Non-zero exit → show the errors, fix the block with the user, write again.

## Step 8 — Return the result

Print the full `## Platform` YAML and where it was written (or that nothing
changed). The repo `CLAUDE.md` is not reloaded mid-session, so a calling skill
takes the statuses from this output.

## Boundaries

- The only repo change is the `statuses` key of `## Platform`. Never commit or
  push it; the change stays in the working tree for the user or the calling
  skill.
- The only tracker writes are `label.create`, each after an explicit yes.
  Never change an issue's state, labels or comments here.
- Vault access is filesystem-only — no Obsidian or Linear MCP, no Local REST
  API, no git against the vault.

## Related skills

- `nerd4rent:determine-platform` — chains here once the platform is recorded.
- `nerd4rent:issue-workflow`, `nerd4rent:issue-start`, `nerd4rent:issue-close`,
  `nerd4rent:project-continue` — read and write phases through the strategy
  this skill binds.
- `nerd4rent:nerdbrain-wiki` — the write procedure for the entity-page mirror.
