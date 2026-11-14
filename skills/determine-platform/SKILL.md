---
name: determine-platform
description: >-
  Establish the project's platform — which tracker holds its issues (Linear,
  GitHub Issues, GitLab Issues, Azure DevOps Boards, Jira Cloud, or none) and which VCS host
  holds its code (GitHub, GitLab, Azure DevOps) — and record it in the user-owned
  nerdway config store, mirrored as `platform:` on the nerdbrain entity page.
  Reads the existing config first, infers from the git remote and the tracker CLI,
  and asks one question only when the answer is ambiguous. Use for
  `/determine-platform`, when a core skill reports that no platform is
  configured, or when the user asks which tracker or host a project uses
  ("jaka platforma", "ustal platformę", "set the platform", "which tracker").
---

# Determine platform

One pass: **read → infer → (ask) → write both places → bind statuses →
return**. The result is a `PlatformConfig` (schema in `workflow-graph.json`):
`tracker`, `vcs`, the identifier block of each platform in use, and the
`statuses` block `bind-statuses` adds. Core skills pick their adapter files
from `tracker` and `vcs`.

This skill may run at any issue status: it writes only the user-owned nerdway
config store (and the entity-page mirror), never a file in the repo.

## Adapters

Tracker and VCS commands live in adapter files at the plugin root, never in
this skill:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
${CLAUDE_PLUGIN_ROOT}/adapters/vcs/<vcs>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory. Run an operation by its ID
from the adapter's `## Operations` table.

## The config shape

Both places hold the same YAML object. Write only the keys that apply — the
identifier block of every platform in use, nothing for the others. The
`statuses` key belongs to `bind-statuses` (Step 5): keep an existing one
untouched, never write a new one here.

```yaml
tracker: linear
vcs: github
linear:
  team: DEMO
  project: 72aa8034-9c1f-4206-bd68-38af2eb9c87e
github:
  owner: nerdway
  repo: nerdway
```

| Key | Values | Identifier block |
|-----|--------|------------------|
| `tracker` | `linear`, `github`, `gitlab`, `ado`, `jira`, `none` | `linear: {team, project}` (project = UUID); `jira: {site, project, issueType?}` (site = Cloud hostname, project = key, optional localized work-item type); GitHub/GitLab/ADO trackers reuse the VCS block of the same platform; an ADO tracker's `ado.team`, `ado.board` and `ado.workItemType` are written by `bind-statuses`; optional `github.project` is the GitHub Project (v2) number for the `native` strategy |
| `vcs` | `github`, `gitlab`, `ado` | `github: {owner, repo, project?}`, `gitlab: {group, project}`, `ado: {org, project}` |

## Step 1 — Read what is already recorded

Check the sources in this order and keep the first one that yields a config:

1. **User nerdway config** for this repo, read from disk as
   `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes. Exit code `4` there
   yields no config here: this skill is the one that rewrites it, so note
   what was wrong, report it in Step 6 and go on to source 2. Exit code `5`
   (a leftover `## Platform` section that could not be migrated) stops this
   skill: ask the user to keep the user config, take the repo values, or
   merge, then run `--resolve` as that recipe says before writing anything.
2. **Entity page frontmatter** (`~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md`,
   slug from the SessionStart inject): the `platform:` key.
3. **Legacy entity page alias**: a `linear:` block without `platform:` means
   `tracker: linear` with its `team` and `project`; take `vcs` and its
   identifiers from the git remote (Step 2, first row). `linear: none` records
   no tracker — fall through to inference.

A config from source 1 that already matches source 2 needs no write: go to
Step 5. A config found in only one place is still written to
the other in Step 4.

## Step 2 — Infer

| Signal | Command | Reading |
|--------|---------|---------|
| VCS host | `git remote get-url origin` | host `github.com` → `github` (`owner/repo` from the path); host containing `gitlab` → `gitlab` (`group/project` from the path, subgroups kept in `group`); `dev.azure.com` or `*.visualstudio.com` (SSH hosts included) → `ado`, with `org` and `project` per the Azure DevOps table below |
| Tracker CLI | `auth.check` from `adapters/trackers/linear.md` | exit 0 → the Linear CLI is installed and authenticated |
| Linear project | `project.list` from `adapters/trackers/linear.md` | projects whose name equals the repo name, case-insensitive |
| Jira CLI | `auth.check` from `adapters/trackers/jira.md` | exit 0 → `acli` is installed and authenticated to Jira Cloud |
| Jira project | `project.list` from `adapters/trackers/jira.md` | projects whose `key` or `name` equals the repo name, case-insensitive |

Azure DevOps remotes come in four forms, and on `*.visualstudio.com` the
organisation is the subdomain, not the first path segment:

| Remote form | `org` | `project` |
|-------------|-------|-----------|
| `https://[<user>@]dev.azure.com/<org>/<project>/_git/<repo>` | first path segment | second path segment |
| `https://<org>.visualstudio.com/[DefaultCollection/]<project>/_git/<repo>` | subdomain | segment before `_git` |
| `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` | segment after `v3` | next segment |
| `<org>@vs-ssh.visualstudio.com:v3/<org>/<project>/<repo>` | segment after `v3` | next segment |

Percent-decode `project` (`My%20Project` → `My Project`); YAML-quote it when
it contains spaces.

The inference is **unambiguous** only when all three hold: the origin host
maps to exactly one VCS, the Linear CLI is authenticated, and exactly one
Linear project in exactly one team matches the repo name. Then the result is
`tracker: linear` plus that team key and project UUID, `vcs` from the host —
write it without asking. A matching Jira project is never unambiguous on its
own: `acli` being authenticated does not mean this repo's issues live in
Jira, so always ask (Step 3) when Linear did not settle.

## Step 3 — Ask (only when Step 2 is ambiguous)

Ask **one** question in plain chat — a numbered list, not `AskUserQuestion`,
which caps options at four. Put the recommendation first and give its reason
from the signals you collected:

```
Which platform does this project use?
  1. Linear + GitHub   (recommended — origin is github.com, Linear CLI authenticated, no project named <repo>)
  2. Linear + GitLab
  3. Linear + Azure DevOps
  4. GitHub Issues + GitHub
  5. GitLab Issues + GitLab
  6. Azure DevOps Boards + Azure DevOps
  7. Jira Cloud + GitHub
  8. Jira Cloud + GitLab
  9. Jira Cloud + Azure DevOps
Or answer `none` for no tracker (then name the VCS host).
```

Then ask only for the identifiers inference could not settle (for Linear: the
team key from `team.list`, the project from `project.list`; for Jira Cloud:
`jira.site` as the Cloud hostname, `jira.project` from `project.list`, and
optionally `jira.issueType` from the adapter's type-discovery recipe — leave
it unset when several types look equally likely).

When `tracker` is `github`, list the owner's Projects (`gh project list
--owner <github.owner> --format json --limit 100` in
`adapters/trackers/github.md` `## CLI`). One project → record its `number`
as `github.project`. Several → ask which one, recommending a title that
matches the repo, or none. None → omit `github.project`; GitHub stays on
labels until `/board-setup` records a project. `--keys github` replaces
the whole `github` object, so write `owner`, `repo` and `project` together
when the number is known.

A combination with no adapter file yet is still recorded — the core skill
that needs it will stop with "adapter not available yet". Never substitute
Linear for it.

## Step 4 — Write both places

**User nerdway config** — write through the script, never by editing a repo
file. Carry over existing top-level `statuses` and `pr` keys. Pipe the YAML
object to:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/write-platform-config.ts" --repo "$(git rev-parse --show-toplevel)"
```

Non-zero exit → show the errors, fix the object with the user, write again.
Running the skill twice with the same result must leave the config file
unchanged.

**Entity page** — only when the vault is reachable (`tier=file`) and the page
exists. Follow `nerdway:nerdbrain-wiki` for the write (filesystem only,
`updated:` bump, one `log.md` line):

- set the frontmatter key `platform:` to the same object, keeping an existing
  `platform.statuses`;
- remove the legacy `linear:` block together with its nested lines and
  comment lines — one source, never two;
- nothing else on the page changes.

Skip the page silently with `tier=none` or no page; the user config alone is
enough.

## Step 5 — Bind statuses

With a tracker (anything but `none`), invoke `nerdway:bind-statuses` and
pass it the config from Step 4. It proposes how the tracker shows the
workflow phases, asks one question, and writes the `statuses` key into the
same section. When the user declines or it stops, carry on: without a
`statuses` block the tracker adapter's default applies.

`tracker: none` → skip this step.

## Step 6 — Return the result

Print the YAML block — including `statuses` when `bind-statuses` wrote it —
and where it was written (or that nothing changed). The calling skill takes
the platform from this output, or reads the store again as
`${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes.

## Boundaries

- Never write platform metadata into the repository. The only writes are the
  user nerdway config (through `write-platform-config.ts`) and the entity-page
  mirror. The `statuses` key is written through `bind-statuses`.
- Vault access goes through the filesystem by default; an MCP server is the
  transport only where the vault filesystem is absent (ADR-0010). Never git
  against the vault (ADR-0004).
- Never create tracker projects, repos or teams here; that is
  `nerdway:new-project-workflow`.

## Related skills

- `nerdway:issue-writer` — delegates here when no platform is configured.
- `nerdway:bind-statuses` — the chain this skill ends with; also runs on
  its own.
- `nerdway:board-setup` — creates missing statuses, columns or labels and
  records `github.project` when a Project is chosen later.
- `nerdway:nerdbrain-wiki` — the write procedure for the entity-page mirror.
