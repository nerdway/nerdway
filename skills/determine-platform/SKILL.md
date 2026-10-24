---
name: determine-platform
description: >-
  Establish the project's platform — which tracker holds its issues (Linear,
  GitHub Issues, GitLab Issues, Azure DevOps Boards, or none) and which VCS host
  holds its code (GitHub, GitLab, Azure DevOps) — and record it as the
  `## Platform` section of the repo CLAUDE.md, mirrored as `platform:` on the
  nerdbrain entity page. Reads the existing config first, infers from the git
  remote and the tracker CLI, and asks one question only when the answer is
  ambiguous. Use for `/determine-platform`, when a core skill reports that no
  platform is configured, or when the user asks which tracker or host a project
  uses ("jaka platforma", "ustal platformę", "set the platform", "which tracker").
---

# Determine platform

One pass: **read → infer → (ask) → write both places → bind statuses →
return**. The result is a `PlatformConfig` (schema in `workflow-graph.json`):
`tracker`, `vcs`, the identifier block of each platform in use, and the
`statuses` block `bind-statuses` adds. Core skills pick their adapter files
from `tracker` and `vcs`.

This skill may run at any issue status: the `no-repo-change-before-in-progress`
rule exempts exactly one repo change — replacing the `## Platform` section of
the repo `CLAUDE.md`. Touch nothing else in the repo.

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
| `tracker` | `linear`, `github`, `gitlab`, `ado`, `none` | `linear: {team, project}` (project = UUID); GitHub/GitLab/ADO trackers reuse the VCS block of the same platform; an ADO tracker's `ado.team`, `ado.board` and `ado.workItemType` are written by `bind-statuses` |
| `vcs` | `github`, `gitlab`, `ado` | `github: {owner, repo}`, `gitlab: {group, project}`, `ado: {org, project}` |

## Step 1 — Read what is already recorded

Check the sources in this order and keep the first one that yields a config:

1. **Repo `CLAUDE.md`** at `git rev-parse --show-toplevel`, read from disk as
   `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes: the section from the
   line-start heading `## Platform` to the next line-start `## ` (or EOF),
   holding one fenced `yaml` block. A broken section (exit code `4` there)
   yields no config here: this skill is the one that rewrites it, so note
   what was wrong, report it in Step 6 and go on to source 2.
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
write it without asking.

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
Or answer `none` for no tracker (then name the VCS host).
```

Then ask only for the identifiers inference could not settle (for Linear: the
team key from `team.list`, the project from `project.list`).

A combination with no adapter file yet is still recorded — the core skill
that needs it will stop with "adapter not available yet". Never substitute
Linear for it.

## Step 4 — Write both places

**Repo `CLAUDE.md`** — replace the section idempotently:

1. Find the heading `## Platform` **at the start of a line**. Never splice on
   a bare substring search: the heading text can recur in prose.
2. Present → replace everything from that line up to (not including) the next
   line starting with `## `, or to EOF, with the new section — carrying over
   an existing top-level `statuses:` key with all its indented lines as is.
3. Absent → append the section at the end of the file, after one blank line.
   No `CLAUDE.md` at all → create it holding only the section.
4. The section is the heading, one blank line, the fenced `yaml` block, one
   blank line.

Running the skill twice with the same result must leave `git diff` empty.

**Entity page** — only when the vault is reachable (`tier=file`) and the page
exists. Follow `nerdway:nerdbrain-wiki` for the write (filesystem only,
`updated:` bump, one `log.md` line):

- set the frontmatter key `platform:` to the same object, keeping an existing
  `platform.statuses`;
- remove the legacy `linear:` block together with its nested lines and
  comment lines — one source, never two;
- nothing else on the page changes.

Skip the page silently with `tier=none` or no page; the repo section alone is
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
the platform from this output, or reads the file again as
`${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes. A `CLAUDE.md` that
is part of the conversation context is no source: Claude Code loaded it
before this write and never reloads it, and Cursor loads it only with
Third-Party Imports on.

## Boundaries

- The only repo change is the `## Platform` section (the `statuses` key in
  it through `bind-statuses`). Never commit or push
  it: the skill may run on `main` or on another issue's branch, so the change
  stays in the working tree for the user or the calling skill to commit.
- Vault access goes through the filesystem by default; an MCP server is the
  transport only where the vault filesystem is absent (ADR-0010). Never git
  against the vault (ADR-0004).
- Never create tracker projects, repos or teams here; that is
  `nerdway:new-project-workflow`.

## Related skills

- `nerdway:issue-writer` — delegates here when no platform is configured.
- `nerdway:bind-statuses` — the chain this skill ends with; also runs on
  its own.
- `nerdway:nerdbrain-wiki` — the write procedure for the entity-page mirror.
