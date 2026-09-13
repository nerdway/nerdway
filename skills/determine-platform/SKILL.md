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

One pass: **read → infer → (ask) → write both places → return**. The result
is a `PlatformConfig` (schema in `workflow-graph.json`): `tracker`, `vcs`, and
the identifier block of each platform in use. Core skills pick their adapter
files from `tracker` and `vcs`.

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
identifier block of every platform in use, nothing for the others, no
`statuses` yet:

```yaml
tracker: linear
vcs: github
linear:
  team: DEMO
  project: 72aa8034-9c1f-4206-bd68-38af2eb9c87e
github:
  owner: nerd4rent
  repo: nerd4rent-claude-plugin
```

| Key | Values | Identifier block |
|-----|--------|------------------|
| `tracker` | `linear`, `github`, `gitlab`, `ado`, `none` | `linear: {team, project}` (project = UUID); GitHub/GitLab/ADO trackers reuse the VCS block of the same platform |
| `vcs` | `github`, `gitlab`, `ado` | `github: {owner, repo}`, `gitlab: {group, project}`, `ado: {org, project}` |

## Step 1 — Read what is already recorded

Check the sources in this order and keep the first one that yields a config:

1. **Repo `CLAUDE.md`** at `git rev-parse --show-toplevel`: the section from
   the line-start heading `## Platform` to the next line-start `## ` (or EOF),
   holding one fenced `yaml` block.
2. **Entity page frontmatter** (`~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md`,
   slug from the SessionStart inject): the `platform:` key.
3. **Legacy entity page alias**: a `linear:` block without `platform:` means
   `tracker: linear` with its `team` and `project`; take `vcs` and its
   identifiers from the git remote (Step 2, first row). `linear: none` records
   no tracker — fall through to inference.

A config from source 1 that already matches source 2 needs no write: go to
Step 5 and return it. A config found in only one place is still written to
the other in Step 4.

## Step 2 — Infer

| Signal | Command | Reading |
|--------|---------|---------|
| VCS host | `git remote get-url origin` | host `github.com` → `github` (`owner/repo` from the path); host containing `gitlab` → `gitlab` (`group/project` from the path, subgroups kept in `group`); `dev.azure.com` or `*.visualstudio.com` → `ado` (`org/project` from the path) |
| Tracker CLI | `auth.check` from `adapters/trackers/linear.md` | exit 0 → the Linear CLI is installed and authenticated |
| Linear project | `project.list` from `adapters/trackers/linear.md` | projects whose name equals the repo name, case-insensitive |

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
   line starting with `## `, or to EOF, with the new section.
3. Absent → append the section at the end of the file, after one blank line.
   No `CLAUDE.md` at all → create it holding only the section.
4. The section is the heading, one blank line, the fenced `yaml` block, one
   blank line.

Running the skill twice with the same result must leave `git diff` empty.

**Entity page** — only when the vault is reachable (`tier=file`) and the page
exists. Follow `nerd4rent:nerdbrain-wiki` for the write (filesystem only,
`updated:` bump, one `log.md` line):

- set the frontmatter key `platform:` to the same object;
- remove the legacy `linear:` block together with its nested lines and
  comment lines — one source, never two;
- nothing else on the page changes.

Skip the page silently with `tier=none` or no page; the repo section alone is
enough.

## Step 5 — Return the result

Print the YAML block and where it was written (or that nothing changed). The
repo `CLAUDE.md` is not reloaded mid-session, so the calling skill takes the
platform from this output, not from its own copy of `CLAUDE.md`.

## Boundaries

- The only repo change is the `## Platform` section. Never commit or push
  it: the skill may run on `main` or on another issue's branch, so the change
  stays in the working tree for the user or the calling skill to commit.
- Vault access is filesystem-only — no Obsidian or Linear MCP, no Local REST
  API, no git against the vault.
- Never create tracker projects, repos or teams here; that is
  `nerd4rent:new-project-workflow`.

## Related skills

- `nerd4rent:issue-writer` — delegates here when no platform is configured.
- `nerd4rent:nerdbrain-wiki` — the write procedure for the entity-page mirror.
