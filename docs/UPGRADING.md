# Upgrading from 0.75.0 or earlier

This page takes an install of nerdway 0.75.0 or earlier to the current `main` (0.86.0). Several changes in between are breaking and have no compatibility alias: old names are ignored without a warning. Work through the sections in order, or jump to [Upgrade order](#upgrade-order) for the short version.

Upgrades from one recent `main` commit to the next need nothing from this page. The install check at session start tells you when your copy is behind and how to update it (see [The plugin tells you when it is out of date](USER-GUIDE.md#the-plugin-tells-you-when-it-is-out-of-date)).

## Your installed version

In Claude Code, the plugin list shows the installed version:

```bash
claude plugin list
```

In Cursor, a local clone carries the version in its manifest:

```bash
grep '"version"' ~/.cursor/plugins/local/nerdway/.claude-plugin/plugin.json
```

## Summary

| Change | Version | Breaking | Your action | Check |
|---|---|---|---|---|
| [Selective CLI bootstrap](#new-and-changed-skills) | 0.76.0 | no | none | `/nerdway:bootstrap-clis` asks before installing |
| [Plugin identity](#plugin-identity) | 0.77.0 | yes | reinstall, update prompts and rules | `claude plugin list`, skills listed as `nerdway:` |
| [Environment variables](#environment-variables) | 0.77.0 | yes | rename `*_` variables to `NERDWAY_*` | no old names in your shell profile |
| [Jira Cloud tracker](#new-and-changed-skills) | 0.78.0 | no | none, unless you use Jira | `acli jira auth status` |
| [Platform config in the user store](#platform-config-in-the-user-store) | 0.79.0, 0.81.0 | yes | open a session in each repo, then remove `## Platform` from `CLAUDE.md` | `validate-platform-config.ts` |
| [Board setup](#new-and-changed-skills) | 0.80.0 | no | none | `/nerdway:board-setup` |
| [Collapsed readiness PR layout](#yaml-and-config-sections) | 0.82.0 | no | none, or set `pr.collapse_details: false` | `validate-platform-config.ts --print pr.collapse_details` |
| [Wiki location](#wiki-location) | 0.83.0, 0.83.1 | yes, if you used the old default vault path | set `wiki.path` | `resolve-vault.ts` |
| [YAML and config sections](#yaml-and-config-sections) | 0.84.0, 0.85.0 | only for files with duplicate keys | fix duplicate keys | `validate-platform-config.ts` |
| [Slack intake](#new-and-changed-skills) | 0.86.0 | no | none, unless you use it | `slack-project.ts` |

## The plugin directory

Some checks below run a script that ships with the plugin. In the commands, `<plugin dir>` is one of these:

- Claude Code: `~/.claude/plugins/cache/nerdway/nerdway/<version>`, for example `~/.claude/plugins/cache/nerdway/nerdway/0.86.0`.
- Cursor local install: `~/.cursor/plugins/local/nerdway`.
- Any clone of `https://github.com/nerdway/nerdway` at the same version.

The scripts need `node` 24 or newer. `<your repo>` is the root of the project you work in.

## Plugin identity

Version 0.77.0, breaking, no aliases.

The plugin and its marketplace are both `nerdway`, installed from `https://github.com/nerdway/nerdway`. If you installed the plugin or its marketplace under another id before, remove that plugin and that marketplace first, so the two copies are not loaded at the same time. In Claude Code, the plugin list and the marketplace list show what is installed:

```bash
claude plugin list
```

```bash
claude plugin marketplace list
```

Then install as the [README](../README.md#install) describes: in Claude Code `/plugin marketplace add https://github.com/nerdway/nerdway` and `/plugin install nerdway@nerdway`; in Cursor the team marketplace, or a local clone at `~/.cursor/plugins/local/nerdway`.

What changed with the identity:

- **Slash and skill ids** use the `nerdway:` prefix: `/nerdway:issue-workflow`, `nerdway:grill`, the agents `nerdway:plan-gatherer`, `nerdway:review-judge`, `nerdway:review-mapper`, `nerdway:review-sceptic` and `nerdway:review-synthesizer`, and the workflows `nerdway:plan-context-fanout` and `nerdway:review-verify`. Skill directory names did not change, and no skill was removed or renamed.
- **Your own text** that calls a skill by the old prefix is not rewritten for you: saved prompts, `AGENTS.md`, `CLAUDE.md`, user rules and scripts. Search them for `:issue-workflow`, `:grill` and the other skill names and replace the old prefix with `nerdway:`.
- **The readiness PR marker** is `<!-- nerdway:pr-body -->`. A pull request opened before the upgrade still carries the old marker, so the workflow treats its description as written by hand and posts the new readiness description as a comment instead of replacing it. To let the workflow manage that description again, replace the old marker line in the PR description with `<!-- nerdway:pr-body -->`.
- **Stale copies of plugin skills** in your own skill directories (`~/.claude/skills`, `~/.cursor/skills`, `~/.agents/skills`, and the same under a project) shadow the plugin's current skills. The install check names each one at session start as `stale copy of the nerdway skill <name> at <path>: remove it`. Delete each directory it names.

You are done with this step when the plugin list shows `nerdway@nerdway` at 0.86.0 and your agent lists the skills as `nerdway:<name>`.

## Environment variables

Version 0.77.0, breaking, no aliases.

| Old name | New name |
|---|---|
| `*_HOST` | `NERDWAY_HOST` |
| `*_NO_ISSUE` | `NERDWAY_NO_ISSUE` |
| `*_CACHE_DIR` | `NERDWAY_CACHE_DIR` |
| `*_MAIN_VERSION` | `NERDWAY_MAIN_VERSION` |
| `*_SKILL_DIRS` | `NERDWAY_SKILL_DIRS` |

The install check now caches in `~/.cache/nerdway` (or `$XDG_CACHE_HOME/nerdway`), unless `NERDWAY_CACHE_DIR` says otherwise.

Added later:

- `NERDWAY_CONFIG_DIR` (0.79.0) moves the user config directory; see [Platform config in the user store](#platform-config-in-the-user-store).
- `NERDWAY_WIKI` (0.83.0) points at the wiki directory; see [Wiki location](#wiki-location).

Unchanged: `NERDBRAIN_VAULT` (still read, after `NERDWAY_WIKI`), `NERDBRAIN_INJECT_BUDGET` and `NERDBRAIN_ALIASES`.

The old names are ignored without a warning. A forgotten old `*_NO_ISSUE=1` therefore turns the commit gate back on, and an old `*_HOST` no longer picks the host adapter. Search your shell profiles for the old suffixes and rename every match you set for this plugin:

```bash
grep -nE '_(HOST|NO_ISSUE|CACHE_DIR|MAIN_VERSION|SKILL_DIRS)=' ~/.bashrc ~/.zshrc ~/.profile
```

Unrelated variables such as `DOCKER_HOST` match the pattern too; leave those alone. Check what the current shell exports:

```bash
env | grep '^NERDWAY_'
```

## Platform config in the user store

Version 0.79.0, breaking; copy-only since 0.81.0.

The platform config (tracker, VCS, identifiers, status map) used to be a `## Platform` YAML block in the repo `CLAUDE.md`. It now lives outside the repository, in your user config directory:

- `<config dir>/<slug>/config.yml` for one project;
- `<config dir>/config.yml` for defaults shared by all projects.

The config directory is the first of these that applies:

1. `NERDWAY_CONFIG_DIR`;
2. `$XDG_CONFIG_HOME/nerdway`;
3. `%APPDATA%\nerdway` on Windows;
4. `~/.config/nerdway`.

The slug is the first line of a `.nerdbrain-slug` file in the repo root when there is one. Otherwise it comes from the `origin` remote, with `/` and `.` turned into `-`: `github.com/owner/repo` becomes `github-com-owner-repo`. A repository without a remote uses its directory name.

What happens automatically: on session start, a leftover `## Platform` section in `CLAUDE.md` is copied into the user config when the case is clear. The plugin never writes or deletes `CLAUDE.md`. When the section and an existing user config differ, the agent asks you once to keep the user config, take the repo values, or merge them, and runs the same command you can run yourself:

```bash
node <plugin dir>/scripts/validate-platform-config.ts --resolve keep-user <your repo>
```

The other choices are `take-repo` and `merge`. The choice is recorded in `<config dir>/<slug>/legacy-platform.resolved`; from then on the user config wins. Every session reminds you that the section is no longer read until you remove it from `CLAUDE.md` or change it.

What you do:

1. Open one agent session in each repository that had a `## Platform` section, so the copy runs. Instead, you can run `/nerdway:determine-platform` in that repository, or write the file yourself through `scripts/write-platform-config.ts` (it reads YAML on stdin).
2. Check the result.
3. Delete the `## Platform` section from `CLAUDE.md` and commit that change.

Check that the platform config resolves; the command prints the config as JSON, or `no platform config`. It runs the same copy as the session start, so it also works as the first step:

```bash
node <plugin dir>/scripts/validate-platform-config.ts --print <your repo>
```

Check that the section is gone from the repository:

```bash
grep -n '^## Platform' <your repo>/CLAUDE.md
```

If you ran 0.79.0 or 0.80.0: those releases already removed the section from `CLAUDE.md` after copying it, and deleted a `CLAUDE.md` that held nothing else. There is nothing to restore; the user store is the source. If that removal is still uncommitted in a working tree, commit it or discard it on purpose.

## Wiki location

Versions 0.83.0 and 0.83.1, breaking if you relied on the old default.

The wiki (vault) no longer has a hardcoded default path. The directory is the first of these that is set:

1. `NERDWAY_WIKI`;
2. `NERDBRAIN_VAULT`;
3. `wiki.path` in the project file `<config dir>/<slug>/config.yml`;
4. `wiki.path` in the defaults file `<config dir>/config.yml`;
5. `<config dir>/wiki`.

If your vault sits at the old default path recorded in [ADR-0021](adr/0021-configurable-wiki-location.md), or anywhere else, set it so nothing moves:

```yaml
wiki:
  path: <your current vault directory>
```

Put it in the defaults file, or in a project file for one project. A path may start with `~`; a relative path is resolved against the config directory. A defaults file that holds only `wiki.path` is valid and does not count as a platform setup, so a repository without its own project file still asks for `/nerdway:determine-platform`. The plugin does not create the wiki directory.

Check where the wiki resolves; `source` is `env`, `project`, `defaults` or `default`, and `exists` says whether the directory is there:

```bash
node <plugin dir>/scripts/resolve-vault.ts --json <your repo>
```

## YAML and config sections

Versions 0.84.0 and 0.85.0, breaking only for a file with a duplicate key.

Config files are read as full YAML 1.2 through a vendored copy of the `yaml` library. Comments, block scalars, flow collections, quoted strings and anchors are accepted. A write changes only the section it updates, so your comments, key order and keys the plugin does not know survive. Duplicate keys are now an error; a file that older releases read without complaint still reads the same, unless it repeats a key.

Settings that do not belong to the plugin core go under `extensions.<id>`. An unknown top-level key is kept and reported as a notice that points at `extensions:`, not an error. The [config section API](CONFIG-SECTIONS.md) describes the sections and their keys.

Since 0.82.0, `pr.collapse_details` (default true) gives the readiness PR description a short Summary with the details collapsed. To keep the older flat layout, set it to false:

```yaml
pr:
  collapse_details: false
```

Check that every config file of a project validates; the command ends with `OK:` or lists the errors, duplicate keys included:

```bash
node <plugin dir>/scripts/validate-platform-config.ts <your repo>
```

Check the layout the readiness description will use:

```bash
node <plugin dir>/scripts/validate-platform-config.ts --print pr.collapse_details <your repo>
```

## New and changed skills

None of these needs an action unless you start using the feature.

- **Selective CLI bootstrap (0.76.0).** `/nerdway:bootstrap-clis` shows the CLIs as a multi-select and installs only what you pick, after a yes. A skill that needs one missing CLI asks for that tool alone. Installing every entry is `scripts/bootstrap-clis.ts --all`.
- **Jira Cloud tracker (0.78.0).** The value `tracker: jira` works through the official Atlassian CLI `acli` 1.3.0 or newer, with `jira.site`, `jira.project` and an optional `jira.issueType`. The commit gate accepts `PROJ-123` style IDs in branch names. See [Requirements](../README.md#requirements) for the login.
- **Board setup (0.80.0).** `/nerdway:board-setup` creates missing statuses, columns or labels after your consent and hands the result to `/nerdway:bind-statuses`, which now only maps. GitHub Issues gains the `native` strategy on the Status field of a Projects (v2) board.
- **Slack intake (0.86.0).** A project Slack channel can start the issue lifecycle, configured by an optional `slack` section (`owner`, `channel`, `autonomous`). See [Slack intake](USER-GUIDE.md#slack-intake).

## Upgrade order

1. Rename the environment variables in your shell profiles and start a new shell.
2. Remove any plugin or marketplace installed under another id, then install `nerdway@nerdway`.
3. Update saved prompts, rules files and scripts to the `nerdway:` prefix, and delete stale skill copies the install check names.
4. Open a session in each repository that has a `## Platform` section in `CLAUDE.md`, and answer the conflict question if the agent asks it.
5. Set `wiki.path` (or `NERDWAY_WIKI`) if you keep a wiki.
6. Remove the `## Platform` section from each `CLAUDE.md` and commit.
7. Run the checks below.

You are done when:

- the plugin list (`claude plugin list`) or the Cursor manifest shows 0.86.0, and a new session prints no install warning;
- the environment (`env | grep '^NERDWAY_'`) shows the variables you use, and your profiles hold no old names;
- the platform check (`validate-platform-config.ts --print <your repo>`) prints your platform for every project;
- the section search (`grep -n '^## Platform' <your repo>/CLAUDE.md`) prints nothing;
- the wiki check (`resolve-vault.ts --json <your repo>`) prints your wiki directory with `"exists":true`, if you keep a wiki.
