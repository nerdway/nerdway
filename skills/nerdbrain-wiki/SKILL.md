---
name: nerdbrain-wiki
description: >-
  HOW to create or update a nerdbrain second-brain entity page at
  5-wiki/entities/projects/<slug>.md in the user's Obsidian vault. Invoke when
  about to write such a wiki page — a write trigger fired, you need section
  update modes (Edit/Append), the obsidian CLI command patterns, the frontmatter
  `updated:` bump, the entity-page template for a new page, or steps to append to
  the wiki index.md / log.md. Also covers drop-to-filesystem rules and advisory
  boundary cases. The WHEN-to-write triggers and hard safety rules live in the
  global ~/.claude/CLAUDE.md.
---

# nerdbrain-wiki: writing entity pages

This skill is the **HOW**. The global `~/.claude/CLAUDE.md` decides **WHEN** to
write and holds the hard safety rules (no MCP, vault root, sync-conflict checks).
Use the `obsidian-cli` skill for the broader CLI surface and `obsidian-markdown`
for note syntax.

Entity pages live at `5-wiki/entities/projects/<slug>.md` and are **English-only**
(tokenization efficiency). Index and log entries follow the vault language
(currently PL).

## Section update modes
- **Edit (rewrite):** Purpose, Stack, Commands, Conventions, References.
- **Append (chronological):** Gotchas, Decisions.
- **Edit + flag staleness:** Active context (flag when updated > 14 days ago).

Always bump frontmatter `updated: YYYY-MM-DD` on every write.

## Inject budget: always vs lazy sections

The SessionStart hook (`nerdbrain-load.sh`) does NOT inject the whole entity
page. It injects a fixed whitelist and drops the rest (DEMO-204):

- **Always in inject:** frontmatter + H1, Purpose, Stack, Commands,
  Conventions, Active context.
- **Lazy (not injected):** Gotchas, Decisions, References, and every section
  outside the whitelist (custom sections like Skills). Append-only sections
  grow without bound, so they can never live in the inject.

When sections are dropped, the inject ends with a marker listing them and the
full page path, e.g.
`[omitted: Gotchas, Decisions — read <path> before debugging or when a
decision's rationale matters]`. The whole inject also has a hard byte budget
(default 8192, env `NERDBRAIN_INJECT_BUDGET`); overflow is cut with
`[truncated — read full page: <path>]`.

**Reading lazy sections:** `Read` the absolute path from the marker
(filesystem-first, per the vault hard rules); `obsidian read` is the
alternative. Any skill that relies on a lazy section — Decisions when
planning, Gotchas before debugging — must read the page itself; the inject
alone is not enough.

## Commands

The patterns below are the canonical shape for wiki entity-page writes.
For the broader CLI surface, see the `obsidian-cli` skill.

```
# Read (the hook pre-loads only the always-in-inject sections; read the
# full page before editing lazy sections)
obsidian read vault=nerdbrain path=5-wiki/entities/projects/<slug>.md

# Append (chronological, end-of-file)
obsidian append vault=nerdbrain \
                path=5-wiki/entities/projects/<slug>.md \
                content="$CONTENT"

# Create a new file
obsidian create vault=nerdbrain \
                path=5-wiki/entities/projects/<slug>.md \
                content="$CONTENT"
```

**Drop to filesystem when:**
- Content has newlines / multi-line markdown (CLI's `content=` value gets
  awkward to escape — use `Write` on the absolute path instead).
- You need a section-aware edit (CLI cannot insert under a specific heading
  — `Read` then `Edit` the file directly).

**If the vault directory itself is missing** (`tier=none`): wiki is
unreachable this session. Do not attempt writes. Mention briefly if the
user asks something the wiki would have answered.

## Index and log maintenance

**New entity page created:**
1. Append to `~/obsidian/nerdbrain/5-wiki/index.md` under `## Projekty`:
   `- [[<slug>]] — <one-line description>` (description in vault language, PL)
2. Append to `~/obsidian/nerdbrain/5-wiki/log.md`:
   `## [YYYY-MM-DD] entity | <slug> (new project page)`

**Entity page updated:**
Append to log only:
`## [YYYY-MM-DD] entity | <slug> (<short note>)`

## Creating a new page

Use the template in [`entity-page-template.md`](entity-page-template.md). Fill
what you know with confidence; leave sections empty rather than guessing.
Initialize `local-paths` with the current `host:$PWD` pair. Set `slug:` and
`remote:` from the hook-injected values.

**`linear.team` and `linear.project` are REQUIRED.** Establish both before
writing the page — never save a page with empty or placeholder values:
- If unknown, resolve via the `linear-cli` skill: `linear team list` for the
  team key, `linear project list --team <key> -j` for the project **UUID**
  (the `id` field; use the UUID, not the name — stable across renames).
- If the project has no Linear counterpart, set the scalar `linear: none`
  (explicit "checked, none exists" — not an omission).

Then run the index + log maintenance steps above.

## Advisory boundary cases
- Two repos map to the same slug → use `.nerdbrain-slug` in one to differentiate.
- Active context > 14 days old → treat as possibly stale; verify with the user
  before relying on it, and re-flag staleness on edit.
- Hook flagged sync conflicts → do NOT write to the affected page; tell the user
  (enforced in CLAUDE.md; repeated here as a write-time reminder).
