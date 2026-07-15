---
name: nerdbrain-wiki
description: >-
  HOW to create or update a nerdbrain second-brain entity page at
  5-wiki/entities/projects/<slug>.md in the user's Obsidian vault. Invoke when
  about to write such a wiki page — a write trigger fired, you need section
  update modes (Edit/Append), the filesystem+git write pattern, the frontmatter
  `updated:` bump, the entity-page template for a new page, or steps to append to
  the wiki index.md / log.md. Also covers advisory boundary cases. The WHEN-to-write
  triggers and hard safety rules live in the global ~/.claude/CLAUDE.md.
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

**Reading lazy sections:** `Read` the absolute path from the marker. Any
skill that relies on a lazy section — Decisions when planning, Gotchas
before debugging — must read the page itself; the inject alone is not
enough.

## Graph recall (on-demand)

Beyond the current entity page, the vault is a graph: `related:` links to
other entity pages, and any page may already document a problem you're about
to solve again. Follow the graph **on demand**, not speculatively.

**When to reach into the graph:**
1. The task **explicitly** touches another project/concept already present
   in the graph — listed in the current page's `related:`, or named directly
   by the user or the issue.
2. You're debugging or planning something that might have a precedent
   elsewhere — a non-trivial bug or a recurring gotcha. Search on the
   problem's specific keywords, not the whole task description.

Do not read related pages or run vault searches outside these two triggers.

**`related:`/`[[link]]` follow:** an entity page's `related:` frontmatter
holds `"[[slug]]"` entries; `slug` → path
`5-wiki/entities/projects/<slug>.md` (same convention as the rest of this
skill).

```
obsidian read vault=nerdbrain path=5-wiki/entities/projects/<slug>.md
```

Read only the section(s) relevant to the task — same always/lazy contract as
the current page, not the whole file.

**Vault search:** two-step — a cheap, capped search first, then read only
what looks relevant.

```
# 1. Cast a narrow net — small limit, scan snippets before opening anything
obsidian search:context query="<specific keywords>" limit=5

# 2. Only then, read the specific file(s) that looked relevant
obsidian read vault=nerdbrain path=<hit-path>
```

`obsidian search` (without `:context`) returns bare filenames if you don't
need surrounding lines.

**Hard limits (textual, not code-enforced — treat as a hard gate, not a
suggestion):**
- Max **3** related pages read in full per session (the page already
  injected by SessionStart doesn't count against this).
- From each related page, take only the sections relevant to the task.
- `search`/`search:context` always with `limit=5` unless the user asks for
  more — review the list/snippets before any `obsidian read`.

**Fallback without the `obsidian` CLI** (`tier=none` or CLI unavailable):
`Grep`/`Read` over `~/obsidian/nerdbrain/5-wiki/` directly, same limits (3
pages read in full, 5 grep hits reviewed before opening any file).

**Debugging flows:** a debugging session (e.g. `superpowers:systematic-debugging`)
should consult this same pattern before reaching for a vault search — this
skill doesn't modify third-party skills to wire that in automatically.

## Commands

The patterns below are the canonical shape for wiki entity-page writes: plain
filesystem (`Read`/`Edit`/`Write`) on the absolute vault path, identically on
desktop and headless server (ADR-0001). Every write closes out with the Git
protocol below.

```
PAGE=~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md

# Read (the hook pre-loads only the always-in-inject sections; read the
# full page before editing lazy sections)
Read $PAGE

# Section-aware edit (rewrite a specific section under its heading)
Edit $PAGE   # old_string = the section's current content, new_string = updated content

# Append (chronological, end-of-file — Gotchas, Decisions)
Edit $PAGE   # old_string = last existing line, new_string = last line + new entry

# Create a new file
Write $PAGE  # content = filled entity-page-template.md
```

**If the vault directory itself is missing** (`tier=none`): wiki is
unreachable this session. Do not attempt writes. Mention briefly if the
user asks something the wiki would have answered.

## Git protocol (every wiki write)

Per ADR-0002, wrap every logical wiki write (page + index/log together) in
git, identically on every tier:

1. **Before the first wiki edit of the session:** `git -C
   ~/obsidian/nerdbrain pull --rebase`. Run this before touching any file —
   on a clean tree — not right before the commit; `git pull --rebase`
   refuses when the tree is dirty. If it fails, either from a dirty tree
   (unrelated uncommitted changes) or a real rebase conflict: STOP, do not
   write, and report to the user — alongside the existing syncthing
   sync-conflict guard.
2. **After the edit** (page + index/log as one logical write):
   ```
   git -C ~/obsidian/nerdbrain commit -m "<message per vault convention>"
   git -C ~/obsidian/nerdbrain pull --rebase
   git -C ~/obsidian/nerdbrain push
   ```
   The second `pull --rebase` catches anything pushed remotely between step 1
   and now. Same STOP-and-report rule if it conflicts.

There is exactly one write recipe now — no CLI-preferred/filesystem-fallback
split.

## Index and log maintenance

**New entity page created:**
1. Append to `~/obsidian/nerdbrain/5-wiki/index.md` under `## Projekty`:
   `- [[<slug>]] — <one-line description>` (description in vault language, PL)
2. Append to `~/obsidian/nerdbrain/5-wiki/log.md`:
   `## [YYYY-MM-DD] entity | <slug> (new project page)`

Commit page + index + log together as one logical write (Git protocol above).

**Entity page updated:**
Append to log only:
`## [YYYY-MM-DD] entity | <slug> (<short note>)`

Commit page + log together as one logical write (Git protocol above).

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

Then run the index + log maintenance steps above, closing out with the Git
protocol.

## Advisory boundary cases
- Two repos map to the same slug → use `.nerdbrain-slug` in one to differentiate.
- Active context > 14 days old → treat as possibly stale; verify with the user
  before relying on it, and re-flag staleness on edit.
- Hook flagged sync conflicts → do NOT write to the affected page; tell the user
  (enforced in CLAUDE.md; repeated here as a write-time reminder).
