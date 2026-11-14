# Configurable wiki location via resolveVault

*2026-11-14. Amends ADR-0001 and ADR-0010: the filesystem and MCP transports
are unchanged; only how the vault directory is found changes.*

The vault used to be a single hardcoded path (`~/obsidian/nerdbrain`, or
`join(home, "obsidian", "nerdbrain")` in the SessionStart hook). That made
Obsidian the only default location. The wiki can live in any directory;
Obsidian stays a supported place to keep the files.

**`resolveVault` in `scripts/lib/nerdway-config.ts` is the one function that
names the vault directory. Skills call `scripts/resolve-vault.ts` once and
use `<VAULT>` thereafter.** This is pass 1: location only. Moving content,
a migration script, renaming `.nerdbrain-slug`, the MCP connector prefix,
opt-in hook context, Polish strings and checkpoint field changes are pass 2.

Resolution order:

1. Env `NERDWAY_WIKI`, then the legacy env `NERDBRAIN_VAULT` (still honoured;
   the SessionStart hook already read it).
2. Config key `wiki.path` from `<configDir>/<slug>/config.yml`, then from
   `<configDir>/config.yml`. Any directory path is allowed; `~` is expanded;
   a relative path is resolved against `configDir`.
3. Default `<configDir>/wiki`.

The result is `{path, source, exists}` with `source` one of
`env | project | defaults | default`. The directory is not created here,
except where a skill already creates vault content.

The platform-config writer does not inject `wiki.path` into a newly
generated defaults file: that would add a key the caller did not supply.
The implicit default (step 3) is enough. Validation accepts `wiki.path` as
a string and rejects a non-string value (`wiki` must be an object).

**Existing users** who keep the vault in Obsidian set that path themselves:

```yaml
wiki:
  path: ~/obsidian/nerdbrain
```

in `<configDir>/config.yml` (or the project overlay), or set `NERDWAY_WIKI`
/ `NERDBRAIN_VAULT`. Without that, a new install uses `<configDir>/wiki`.

## Considered Options

- **Keep the Obsidian path as the implicit default** — rejected: it makes
  one vendor folder the default for a wiki that is just files.
- **Inject `wiki.path: <configDir>/wiki` when writing defaults** — rejected
  for pass 1: the writer currently emits exactly the map it is given;
  injecting a key would change that semantics. The implicit default covers
  the same path.
- **Deep-merge `wiki` across defaults and project** — rejected: merge stays
  per top-level key (ADR-0018). `resolveVault` still reads `wiki.path` from
  the project file first, then the defaults file, so a project file without
  `wiki.path` does not hide a defaults `wiki.path`.

## Consequences

- Skills, adapters, the SessionStart hook and the plan-gatherer refer to a
  resolved `<VAULT>`, never a literal vault path.
- `file` and `mcp` adapters keep working; only the probe's directory changes.
- Historic ADR / plans / specs / research may still name the old path.
- Pass 2 still has to move content, write a migration helper, and decide
  whether to rename `.nerdbrain-slug`.
