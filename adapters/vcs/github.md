# VCS adapter: GitHub

Selected by `vcs: github` in the platform config. Identifiers come from the
config's `github` block (`owner`, `repo`).

## CLI

`gh` is the GitHub CLI. Every PR command runs against the PR of the current
branch. Never use `--force` or confirmation-bypassing flags.

## Detection

Used only when no platform config exists: read `git remote get-url origin`.

- Host contains `github.com` → GitHub.
- Host contains `gitlab` → GitLab (`adapters/vcs/gitlab.md`).
- Host `dev.azure.com`, `ssh.dev.azure.com`, `*.visualstudio.com` or
  `vs-ssh.visualstudio.com` → Azure DevOps (`adapters/vcs/ado.md`).
- Ambiguous → fall back to whichever CLI is installed (`command -v gh` /
  `command -v glab` / `command -v az`). If the needed CLI is missing, stop and
  report.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `gh auth status` | not authenticated → stop with "Run `gh auth login` and re-run." |
| `repo.view` | `gh repo view <name>` | exit 0 → the repo exists; surface its URL |
| `repo.create` | `gh repo create <name> --public\|--private --source=. --remote=origin --push` | pick one visibility flag; never `--force` |
| `pr.create-draft` | `gh pr create --draft --title "<ID>: <title>" --body "<body>"` | body per `## Magic words`; prints the PR URL |
| `pr.view` | `gh pr view --json title,body,baseRefName` | the PR's stated intent; read-only |
| `pr.diff` | `gh pr diff` | the PR's diff; read-only |
| `pr.list-merged` | `gh pr list --state merged --limit 5` | the last merged PRs; read-only |
| `pr.view-base` | `gh pr view --json baseRefName,isDraft` | read **before** merging: `baseRefName` is the branch to switch to afterwards |
| `pr.mark-ready` | `gh pr ready` | only when `isDraft` is `true` |
| `pr.merge` | `gh pr merge --merge` | a **merge commit** is the only method this workflow uses — the branch's atomic commits must survive the merge |

## Magic words

The PR body starts with the line `Fixes <ID>` (one line per issue if the PR
closes several), then a blank line, then the summary:

```
Fixes <ID>

<one-paragraph summary>
```

It lets the Linear↔GitHub integration track the PR and auto-close the issue
on merge.

With `tracker: github` the ID is the GitHub one: `Fixes #123` for an issue in
the same repo, `Fixes owner/repo#123` for an issue in another repo. GitHub
closes the issue itself, but only when the PR merges into the repo's
**default branch**.

## URL

`gh pr create` prints the PR URL; `gh repo view <name>` and
`gh repo create` print the repo URL.
