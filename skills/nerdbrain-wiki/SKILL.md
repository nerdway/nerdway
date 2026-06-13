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

## Commands

The patterns below are the canonical shape for wiki entity-page writes.
For the broader CLI surface, see the `obsidian-cli` skill.

```
# Read (rare; the hook usually pre-loads the page)
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
`remote:` from the hook-injected values. Then run the index + log maintenance
steps above.

## Advisory boundary cases
- Two repos map to the same slug → use `.nerdbrain-slug` in one to differentiate.
- Active context > 14 days old → treat as possibly stale; verify with the user
  before relying on it, and re-flag staleness on edit.
- Hook flagged sync conflicts → do NOT write to the affected page; tell the user
  (enforced in CLAUDE.md; repeated here as a write-time reminder).
