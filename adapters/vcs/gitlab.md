# VCS adapter: GitLab

Selected by `vcs: gitlab` in the platform config. Identifiers come from the
config's `gitlab` block (`group`, `project`).

## CLI

`glab` is the GitLab CLI. Every MR command runs against the MR of the current
branch.

An operation whose command is `—` is not available on GitLab in this plugin
version: stop and report it — never substitute another platform's command.

## Detection

Used only when no platform config exists: read `git remote get-url origin`.

- Host contains `gitlab` → GitLab.
- Host contains `github.com` → GitHub (`adapters/vcs/github.md`).
- Host `dev.azure.com`, `ssh.dev.azure.com`, `*.visualstudio.com` or
  `vs-ssh.visualstudio.com` → Azure DevOps (`adapters/vcs/ado.md`).
- Ambiguous → fall back to whichever CLI is installed (`command -v gh` /
  `command -v glab` / `command -v az`). If the needed CLI is missing, stop and
  report.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `glab auth status` | not authenticated → stop with "Run `glab auth login` and re-run." |
| `repo.view` | `—` | project bootstrap supports GitHub only |
| `repo.create` | `—` | project bootstrap supports GitHub only |
| `pr.create-draft` | `glab mr create --draft --yes --title "<ID>: <title>" --description "<body>"` | body per `## Magic words` |
| `pr.view` | `glab mr view` | the MR's title and description; read-only |
| `pr.diff` | `glab mr diff` | the MR's diff; read-only |
| `pr.list-merged` | `glab mr list --merged --per-page 5` | the last merged MRs; read-only |
| `pr.view-base` | `glab mr view` | read **before** merging: the target branch is the branch to switch to afterwards |
| `pr.mark-ready` | `—` | the close-out runs no ready step on GitLab |
| `pr.merge` | `glab mr merge --yes` | pass no method-selection flags — the project's merge-method setting decides, and a **merge commit** is the expected configuration |

## Magic words

The MR description starts with the line `Fixes <ID>` (one line per issue if
the MR closes several), then a blank line, then the summary:

```
Fixes <ID>

<one-paragraph summary>
```

There is no Linear↔GitHub-style auto-close on GitLab, so the close-out sets
the issue to Done explicitly.

## URL

`glab mr create` prints the MR URL.
