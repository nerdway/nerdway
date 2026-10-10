# Platform config — reading it from disk

Every project records its platform (tracker, VCS, their identifiers and the
optional `statuses` block) as the `## Platform` section of the repo
`CLAUDE.md`. This file is the one recipe every skill uses to read that
section. A skill's own list of sources decides **when** the repo `CLAUDE.md`
is consulted; this file decides **how**. Background: ADR-0007.

## Read the file, never the context

Always read `$(git rev-parse --show-toplevel)/CLAUDE.md` from disk at the
moment the platform is needed. Never take the platform from a `CLAUDE.md`
that happens to be in the conversation context:

- Claude Code loads the repo `CLAUDE.md` into context at session start and
  never reloads it, so after `determine-platform` or `bind-statuses` writes
  the section, the copy in context is stale.
- Cursor loads the repo `CLAUDE.md` into context only while **Cursor
  Settings → Agents → Third-Party Imports** is on. With it off the file is not
  in context at all, yet the project's platform is still recorded there.

## The recipe

`<plugin root>` is the root the calling skill already resolved for its
adapter files: `${CLAUDE_PLUGIN_ROOT}`, or two directories up from the
skill's base directory when that variable was not substituted.

**1. Script (preferred, Node ≥ 24).** Run:

```bash
node "<plugin root>/scripts/validate-platform-config.ts" --print "$(git rev-parse --show-toplevel)/CLAUDE.md"
```

| Exit code | Meaning | What the skill does |
|-----------|---------|---------------------|
| `0` | stdout is the platform config as JSON, already validated | use it as the platform |
| `3` | no repo `CLAUDE.md`, or no line-start `## Platform` section in it | move on to the skill's next source |
| `4` | the section exists but is broken; stderr lists why | stop and report the errors with "fix the platform config — run `/determine-platform`"; never fall through to another source |

Any other exit code or failure → use the manual read below. That includes
`1`, which comes from Node itself, not from the script (for example
`ERR_UNKNOWN_FILE_EXTENSION` on Node older than 24), and a missing `node`.
Outside a git repo there is no repo `CLAUDE.md`, so move on to the skill's
next source.

**2. Manual read (fallback).** Read the repo `CLAUDE.md` with the file-read
tool, then:

1. Find the heading `## Platform` **at the start of a line** (exactly that
   heading; `## Platform and adapters` or the words inside prose do not count).
2. Take everything from that line up to (not including) the next line
   starting with `## `, or to EOF.
3. That section holds exactly one fenced `yaml` block: the platform config.
   Its keys are listed in `determine-platform` (schema `PlatformConfig` in
   `workflow-graph.json`).

No file or no such heading → move on to the skill's next source. A heading
without exactly one `yaml` block, or YAML that does not parse → stop and
report it, as for exit code `4`.

## Writes

Only `determine-platform` (the whole section) and `bind-statuses` (its
`statuses` key, and the `ado` board keys) write the section. After either
one runs, the calling skill takes the platform from that skill's printed
result or reads the file again with this recipe.
