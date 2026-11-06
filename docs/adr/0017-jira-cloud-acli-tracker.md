# Jira Cloud tracker via the official Atlassian CLI

The grilling session on GitHub issue #5 chose Jira Cloud as a fifth
tracker, reached through the official Atlassian CLI `acli`, with an
Atlassian API token as the agent auth recipe.

**The plugin drives Jira Cloud work items through `adapters/trackers/jira.md`
and `acli`, the same CLI-first shape as `linearis`, `gh`, `glab` and `az`.**
Auth is email plus API token in user secrets, piped into
`acli jira auth login --site … --email … --token`. Statuses default to
`native` when the project can bind five workflow names, and fall back to
`comment` when it cannot. Board mutation (adding missing statuses) is a
separate skill and is not part of this adapter.

## Considered Options

- **Jira Server / Data Center** (REST v2, self-hosted) — rejected: `acli` is
  Cloud-only, and the grill scoped v1 to Cloud. A later DC adapter would
  be a new identifier block and a different CLI or HTTP surface.
- **OAuth / `acli jira auth login --web` as the agent recipe** — rejected:
  a browser flow is heavier than the other tracker CLIs, and the grill
  kept API token (email + token) as the headless path. `--web` stays
  available to a human; skills must not run it.
- **Raw `curl` against REST API v3** — rejected: every other tracker is a
  CLI the user installs and authenticates once. A curl layer would invent
  a second access surface, embed URLs in every recipe, and still need
  the same token.
- **Third-party Jira CLIs** — rejected: unofficial tools drift from Cloud
  work-item APIs; `acli` is the vendor CLI.
- **Wait for the board-setup skill before shipping the adapter** — rejected:
  the grill kept this issue independent. `native` works when the names
  already exist; `comment` covers a board the user cannot change.
- **Official `acli`, Cloud, API token, `native` + `comment` fallback** —
  chosen.

## Consequences

- `PlatformConfig.tracker` includes `jira`. The `jira:` block holds
  `site` (Cloud hostname, no scheme) and `project` (project key). Both
  are required when the tracker is `jira`, and must be shell-safe.
- `cli-dependencies.json` lists `acli` with a real API `auth.check`
  (`jira project list --limit 1`). Install is manual via the vendor
  guide; authentication is never performed for the user.
- Issue IDs are `PROJ-123`, the same letters-dash-digits family as
  Linear. `hooks/require-issue.ts` accepts the configured project key
  on branches and commit messages.
- The default status map is Backlog / To Do / In Progress / In Review /
  Done. Stock simplified workflows lack some of those names;
  `bind-statuses` offers `comment` rather than creating statuses.
- `label` is not supported: Jira has no open/closed flag separate from
  statuses.
- Out of scope for this adapter: Server/DC, OAuth-as-default, JSM,
  Assets, Advanced Roadmaps, historical migration, full Linear
  relation-graph parity.
