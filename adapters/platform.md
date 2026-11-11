# Platform config — reading it from disk

Every project records its platform (tracker, VCS, their identifiers and the
optional `statuses` block) in a user-owned store outside the repository.
Defaults live in `<config dir>/config.yml`; the project overlay lives in
`<config dir>/<project-slug>/config.yml`. A key present in the project file
replaces the default's key whole; missing keys come from defaults. This file
is the one recipe every skill uses to read that store. A skill's own list of
sources decides **when** the config is consulted; this file decides **how**.
Background: ADR-0018.

The config directory is `NERDWAY_CONFIG_DIR` when set, else
`$XDG_CONFIG_HOME/nerdway`, else `~/.config/nerdway` on Linux and macOS, else
`%APPDATA%\nerdway` on Windows. The slug is the same `resolveSlug` as the
nerdbrain wiki (`.nerdbrain-slug` override, else the `origin` remote with
aliases, else the directory name). The files hold identifiers and status
bindings only; tokens stay in `gh` / `acli` / vault auth.

## Read the store, never the context

Always resolve the platform from disk at the moment it is needed. Never take
it from a `CLAUDE.md` that happens to be in the conversation context, and
never treat a leftover `## Platform` section in the repo as the live config
once the user store has it.

A SessionStart hook migrates a leftover `## Platform` section by itself in
the clear case (no project config yet, the section parses, the slug is
unambiguous): it writes the project file, reads it back, compares, then
removes only that section. On conflict or any doubt it removes nothing and
reports; ask the user to keep the user config, take the repo values, or
merge, then run `--resolve keep-user|take-repo|merge` before anything is
deleted.

## The recipe

`<plugin root>` is the root the calling skill already resolved for its
adapter files: `${CLAUDE_PLUGIN_ROOT}`, or two directories up from the
skill's base directory when that variable was not substituted.

**1. Script (preferred, Node ≥ 24).** Run:

```bash
node "<plugin root>/scripts/validate-platform-config.ts" --print "$(git rev-parse --show-toplevel)"
```

| Exit code | Meaning | What the skill does |
|-----------|---------|---------------------|
| `0` | stdout is the platform config as JSON, already validated | use it as the platform |
| `3` | no user config for this repo | move on to the skill's next source |
| `4` | the config exists but is broken; stderr lists why | stop and report the errors with "fix the platform config — run `/determine-platform`"; never fall through to another source |
| `5` | a leftover `## Platform` section could not be migrated; stderr lists why | stop, ask the user (keep user config / take repo / merge), then run `node "<plugin root>/scripts/validate-platform-config.ts" --resolve keep-user\|take-repo\|merge "$(git rev-parse --show-toplevel)"`; never delete the section yourself |

Any other exit code or failure → use the manual read below. That includes
`1`, which comes from Node itself, not from the script (for example
`ERR_UNKNOWN_FILE_EXTENSION` on Node older than 24), and a missing `node`.
Outside a git repo there is no project slug from a worktree, so move on to
the skill's next source.

**2. Manual read (fallback).** Resolve the config directory as above and the
project slug the same way SessionStart does. Read
`<config dir>/<slug>/config.yml` if it exists, then `<config dir>/config.yml`.
Each file is a YAML map of strings and nested maps. For every top-level key,
the project file wins whole; keys missing there come from defaults. The
merged object is the platform config. Its keys are listed in
`determine-platform` (schema `PlatformConfig` in `workflow-graph.json`).

No files → move on to the skill's next source. YAML that does not parse, or
a map that is not a valid `PlatformConfig` → stop and report it, as for exit
code `4`.

## Writes

Only `determine-platform` (the whole project config, or `--defaults`) and
`bind-statuses` (the `statuses` key, and the `ado` board keys) write the
store. They call `node "<plugin root>/scripts/write-platform-config.ts"` and
never edit a file in the repo. After either one runs, the calling skill
takes the platform from that skill's printed result or reads the store again
with this recipe.
