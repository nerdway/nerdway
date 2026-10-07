---
name: nerdbrain-wiki
description: >-
  HOW to create or update a nerdbrain second-brain entity page at
  5-wiki/entities/projects/{slug}.md in the user's Obsidian vault. Invoke when
  about to write such a wiki page — a write trigger fired, you need section
  update modes (Edit/Append/Prepend-capped), the checkpoint entry format for
  `## Checkpoints`, the filesystem write pattern, the frontmatter
  `updated:` bump, the entity-page template for a new page, or steps to append to
  the wiki index.md / log.md. Also covers advisory boundary cases. The WHEN-to-write
  triggers and hard safety rules live in the user rules / AGENTS.md /
  ~/.claude/CLAUDE.md.
---

# nerdbrain-wiki: writing entity pages

This skill is the **HOW**. The user rules / `AGENTS.md` / global
`~/.claude/CLAUDE.md` decide **WHEN** to write and hold the hard safety
rules (no MCP, vault root). Use the
`obsidian-cli` skill for the broader CLI surface and `obsidian-markdown` for
note syntax.

Entity pages live at `5-wiki/entities/projects/<slug>.md` and are **English-only**
(tokenization efficiency). Index and log entries follow the vault language
(currently PL).

## Section update modes
- **Edit (rewrite):** Purpose, Stack, Commands, Conventions, References.
- **Append (chronological):** Gotchas, Decisions.
- **Prepend, capped (newest first, at most 10 entries):** Checkpoints — see
  [Checkpoints](#checkpoints) for the entry format and the cap.
- **Edit + flag staleness:** Active context (flag when updated > 14 days ago).

Always bump frontmatter `updated: YYYY-MM-DD` on every write.

## Inject budget: always vs lazy sections

The SessionStart hook (`nerdbrain-load.sh`) does NOT inject the whole entity
page. It injects a fixed whitelist and drops the rest (DEMO-204):

- **Always in inject:** frontmatter + H1, Purpose, Stack, Commands,
  Conventions, Active context.
- **Lazy (not injected):** Gotchas, Decisions, Checkpoints, References, and
  every section outside the whitelist (custom sections like Skills).
  Append-only sections grow without bound, so they can never live in the
  inject; Checkpoints is capped but stays lazy so the whitelist never grows.

When sections are dropped, the inject ends with a marker listing them and the
full page path, e.g.
`[omitted: Gotchas, Decisions — read <path> before debugging or when a
decision's rationale matters]`. The whole inject also has a hard byte budget
(default 8192, env `NERDBRAIN_INJECT_BUDGET`); overflow is cut with
`[truncated — read full page: <path>]`.

**Reading lazy sections:** `Read` the absolute path from the marker. Any
skill that relies on a lazy section — Decisions when planning, Gotchas
before debugging, Checkpoints when resuming a project — must read the page
itself; the inject alone is not enough.

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

# Prepend, capped (Checkpoints)
Edit $PAGE   # old_string = the `## Checkpoints` heading + current entries,
             # new_string = heading + new entry + the newest 9 existing entries

# Create a new file
Write $PAGE  # content = filled entity-page-template.md
```

**If the vault directory itself is missing** (`tier=none`): wiki is
unreachable this session. Do not attempt writes. Mention briefly if the
user asks something the wiki would have answered.

## Checkpoints

`## Checkpoints` is the project's structured "where are we" history: one
bullet per working session, newest first, written by `issue-workflow`'s
session-summary step and by `project-continue` (which also reads it). It sits
between `## Decisions` and `## Active context`. `## Active context` stays the
free-form narrative; a checkpoint is the one-line pointer that survives a
machine switch.

**Entry format — one line, one bullet, English:**

```
- YYYY-MM-DD — <ISSUE-ID> · <phase> · <branch> @ <7-char HEAD> — next: <one line>
```

| Field | Value |
|-------|-------|
| date | day the entry was written |
| issue ID | the issue the session worked on (one entry = one issue) |
| phase | the issue's canonical phase at the time of writing (`in-progress`, `in-review`, …), read through the status strategy; older entries hold the tracker's state name (`In Progress`), which `project-continue` maps back |
| branch | the git branch the session worked on |
| HEAD | `git rev-parse --short HEAD` after the last commit of the session |
| next | the first item of the session summary's next steps, trimmed to one line |

The branch and hash are what make drift detectable later: `project-continue`
checks that the hash is still an ancestor of the branch tip and that the
issue's phase still matches. The date is a git-independent "how old is this" hint;
never rely on it alone, since Obsidian Sync can deliver the page late.

**Write mode — Prepend, capped:** insert the new entry directly under the
heading, before the existing ones, and drop entries beyond the newest **10**.
The cap is what keeps the section from growing like `## Active context`; a
project's older history is already in Linear's session-summary comments.

**If the heading is missing** on an older page, add it between `## Decisions`
and `## Active context` and treat the section as empty.

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

**`platform:` is REQUIRED.** It holds the project's platform config — the
same YAML object as the `## Platform` section of the repo `CLAUDE.md`
(`tracker`, `vcs`, and the identifier block of each platform in use; schema
`PlatformConfig` in `workflow-graph.json`). Establish it before writing the
page — never save a page with empty or placeholder values:
- If the repo `CLAUDE.md` has the section, copy that object. Read it from
  disk as `adapters/platform.md` at the plugin root describes, never from
  context.
- If unknown, invoke `nerd4rent:determine-platform`; it reads the repo, infers
  or asks, and returns the object to copy. For a Linear tracker both
  `linear.team` (key) and `linear.project` (**UUID**, not the name — stable
  across renames) must be filled.
- If the project has no tracker, set `tracker: none` (explicit "checked, none
  exists" — not an omission).

**Legacy `linear:` alias.** Older pages carry `linear: {team, project}` (or
`linear: none`) instead of `platform:`. Read it as `tracker: linear` with
those identifiers (`linear: none` = no tracker recorded) and the VCS inferred
from `remote:`; such pages keep working without edits. Never write `linear:`
on a new page; `determine-platform` replaces it with `platform:` when it
mirrors the config.

Then run the index + log maintenance steps above.

## Advisory boundary cases
- Two repos map to the same slug → use `.nerdbrain-slug` in one to differentiate.
- Active context > 14 days old → treat as possibly stale; verify with the user
  before relying on it, and re-flag staleness on edit.
