---
name: nerdbrain-wiki
description: >-
  HOW to create or update a nerdbrain second-brain entity page at
  5-wiki/entities/projects/<slug>.md in the user's Obsidian vault. Invoke when
  about to write such a wiki page — a write trigger fired, you need section
  update modes (Edit/Append), the filesystem write pattern, the frontmatter
  `updated:` bump, the entity-page template for a new page, or steps to append to
  the wiki index.md / log.md. Also covers advisory boundary cases. The WHEN-to-write
  triggers and hard safety rules live in the global ~/.claude/CLAUDE.md.
---

# nerdbrain-wiki: writing entity pages

This skill is the **HOW**. The global `~/.claude/CLAUDE.md` decides **WHEN** to
write and holds the hard safety rules (no MCP, vault root). Use the
`obsidian-cli` skill for the broader CLI surface and `obsidian-markdown` for
note syntax.

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
skill). The path is already known, so just `Read` it directly:

```
Read ~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md
```

Read only the section(s) relevant to the task — same always/lazy contract as
the current page, not the whole file.

**Vault search:** when you don't yet know which file(s) you need, use the
`nerdbrain-search` skill's recipes — phrase search, outgoing `[[links]]`,
backlinks, or 1-hop graph — cast a narrow net first, review filenames/snippets,
then `Read` only what looked relevant.

**Hard limits (textual, not code-enforced — treat as a hard gate, not a
suggestion):**
- Max **3** related pages read in full per session (the page already
  injected by SessionStart doesn't count against this).
- From each related page, take only the sections relevant to the task.
- Cap search results at **5** and review the list/snippets before reading
  any file in full.

**Debugging flows:** a debugging session (e.g. `superpowers:systematic-debugging`)
should consult this same pattern before reaching for a vault search — this
skill doesn't modify third-party skills to wire that in automatically.

## Commands

The patterns below are the canonical shape for wiki entity-page writes: plain
filesystem (`Read`/`Edit`/`Write`) on the absolute vault path, identically on
desktop and headless server (ADR-0001). The filesystem write is the whole
recipe — propagation is Obsidian Sync, not this skill's concern.

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

## Index and log maintenance

**New entity page created:**
1. Append to `~/obsidian/nerdbrain/5-wiki/index.md` under `## Projekty`:
   `- [[<slug>]] — <one-line description>` (description in vault language, PL)
2. Append to `~/obsidian/nerdbrain/5-wiki/log.md`:
   `## [YYYY-MM-DD] entity | <slug> (new project page)`

Write page + index + log together as one logical filesystem write.

**Entity page updated:**
Append to log only:
`## [YYYY-MM-DD] entity | <slug> (<short note>)`

Write page + log together as one logical filesystem write.

## Creating a new page

Use the template in [`entity-page-template.md`](entity-page-template.md). Fill
what you know with confidence; leave sections empty rather than guessing.
Initialize `local-paths` with the current `host:$PWD` pair. Set `slug:` and
`remote:` from the hook-injected values.

**`linear.team` and `linear.project` are REQUIRED.** Establish both before
writing the page — never save a page with empty or placeholder values:
- If unknown, resolve with the `linearis` CLI: `linearis teams list` for the
  team key, `linearis projects list --fields nodes.id,nodes.name,nodes.teams.nodes.key`
  for the project **UUID** (the `id` field of the entry matching the project
  name and team key; use the UUID, not the name — stable across renames).
- If the project has no Linear counterpart, set the scalar `linear: none`
  (explicit "checked, none exists" — not an omission).

Then run the index + log maintenance steps above.

## Advisory boundary cases
- Two repos map to the same slug → use `.nerdbrain-slug` in one to differentiate.
- Active context > 14 days old → treat as possibly stale; verify with the user
  before relying on it, and re-flag staleness on edit.
