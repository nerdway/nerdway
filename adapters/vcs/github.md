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
| `pr.review-comments` | `gh api --paginate repos/<owner>/<repo>/pulls/<n>/comments` | review threads of the current PR; `<n>` from `gh pr view --json number --jq .number`. A thread id is `id` where `in_reply_to_id` is null; a reply's `in_reply_to_id` is that id. Author `user.login`, text `body`, place `path` and `line` (`line` is null when the diff moved). Issue comments are a different endpoint and are absent here. Read-only. Proven 2026-10-12 on PR 78 of this repo |
| `pr.review-reply` | `gh api --method POST repos/<owner>/<repo>/pulls/<n>/comments/<id>/replies -F body=@<file>` | write the reply paragraph to `<file>` first. `-F body=@<file>` makes `gh` read that file; the shell never sees the reply, so `$(...)` and backticks in it stay data. `<id>` is the thread id: the top-level review comment, not a reply. Does not resolve the thread. Proven 2026-10-12: a file containing `$(echo pwned)` went out as `-F body=@<file>` unchanged, and the POST reached this repo (404 on a missing parent, no comment left) |
| `pr.edit-body` | `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@<file>` | replaces the whole description of the current PR with `<file>`; write the description to `<file>` first. `<n>` from `gh pr view --json number --jq .number`. Not `gh pr edit`: it fails on a repo that still has classic Projects. `-F body=@<file>` makes `gh` read the file as it is, so the shell never sees the text. GitHub limits a description to 65536 characters. Proven 2026-10-20 on PR 90 of this repo |
| `pr.comment` | `gh api --method POST repos/<owner>/<repo>/issues/<n>/comments -F body=@<file>` | a comment in the PR conversation, not in a review thread; write the text to `<file>` first. `<n>` as in `pr.edit-body`; a PR is an issue for this endpoint. Same 65536-character limit. Not run: the endpoint is GitHub's REST issue comments API, the same family as `pr.review-reply` |
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
