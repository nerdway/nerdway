# User-owned platform config, outside the repository

*Amended 2026-11-14: migration is copy-only. The hook never writes, rewrites
or deletes `CLAUDE.md`. A leftover `## Platform` section is copied into the
user store and then ignored; every session reminds the user they can remove
it by hand. A conflict is asked once; after `--resolve keep-user|take-repo|merge`
a sidecar `<configDir>/<slug>/legacy-platform.resolved` records the sha256
fingerprint of the section's canonical JSON, and a later identical leftover
is `stale-differs` until the section changes.*

The grilling session of GitHub issue #13 chose a hard migration: the
platform config (tracker, VCS, identifiers, status bindings) leaves the
repo `CLAUDE.md` and lives in a user-owned store. nerdway must not leave
project metadata in a client repo or in a PR to someone else's OSS.

**Every reader resolves the platform from `<config dir>/config.yml`
(defaults) merged with `<config dir>/<project-slug>/config.yml`. Every
writer writes only there. A SessionStart hook migrates a leftover
`## Platform` section by itself when the case is clear.** This supersedes
the committed-`CLAUDE.md` location in ADR-0005 and the "this repo keeps
its `## Platform`" consequence in ADR-0007. Skills still read the config
from disk through `adapters/platform.md`, never from conversation context.

The config directory is `NERDWAY_CONFIG_DIR` when set, else
`$XDG_CONFIG_HOME/nerdway`, else `~/.config/nerdway` on Linux and macOS,
else `%APPDATA%\nerdway` on Windows. The override is how one store is
shared between Windows and WSL. The slug is the wiki's `resolveSlug`
(`.nerdbrain-slug` override, else the `origin` remote with aliases, else
the directory name). Merge is per top-level key: a key in the project file
replaces the default's key whole; missing keys come from defaults. The
files hold identifiers and status bindings only; tokens stay in `gh` /
`acli` / vault auth.

Clear-case migration writes the project file, reads it back, and
compares. It never edits or deletes `CLAUDE.md`. A leftover section that
matches the user config is `stale`; a leftover that differs after a
recorded resolve is `stale-differs`; both print a one-line reminder that
the section is no longer read. Conflict or doubt (project config exists
and differs with no matching fingerprint, the section is unreadable, the
slug is ambiguous) writes nothing, reports CLI exit `5`, and the agent
asks the user to keep the user config, take the repo values, or merge.

## Considered Options

- **Keep `CLAUDE.md` as a fallback** — rejected: the grill chose a hard
  migration. A leftover section is not a live source once the user store
  has the config.
- **A repo-side pointer file** (`.nerdway-platform` or similar) — rejected:
  it is the same leak of project metadata into a client repo and into PRs.
- **Deep per-leaf merge** of defaults and project — rejected: it can mix
  `statuses` (and other maps) across trackers. Per-key replacement is the
  whole key or nothing.
- **Secrets in `config.yml`** — rejected: `PlatformConfig` holds only
  identifiers and status bindings; tokens stay in the tracker CLIs and
  vault auth.
- **Sharing a config with a team through the repository** — rejected:
  hard migration was chosen because only the user had worked on these
  projects so far. Team sharing is a different problem.

## Consequences

- `determine-platform` and `bind-statuses` call
  `scripts/write-platform-config.ts` and never edit a file in the repo.
  The entity-page `platform:` mirror is unchanged.
- `hooks/migrate-platform.ts` runs on SessionStart for Claude Code and
  Cursor. `require-issue` uses the same reader, so a legacy section is
  migrated or flagged before the first gate decision.
- `scripts/validate-platform-config.ts` takes a repo root, prints JSON
  with `--print`, and maps `found | absent | invalid | migration-needed`
  to exits `0`, `3`, `4`, `5`. `--resolve keep-user|take-repo|merge`
  finishes a conflict.
- This repository's own leftover `## Platform` section is migrated by the
  same mechanism. The file itself stays until someone removes the section
  by hand.
- Windows `%APPDATA%` is covered by injecting `env` and `platform` in
  tests. A real Windows run is a manual check, not CI.
- The frozen-rule exemptions on `platform-determine` and `statuses-bind`
  in `workflow-graph.json` still name the old `CLAUDE.md` scope. The
  skills no longer exercise that write; updating the contract is a
  follow-up, not this change.
