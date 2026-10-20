# VCS adapter: Azure DevOps

Selected by `vcs: ado` in the platform config. Identifiers come from the
config's `ado` block (`org`, `project`).

## CLI

`az` is the Azure CLI; every command below needs its `azure-devops`
extension. Run the commands from inside the repo checkout: `az repos` detects
the organisation, project and repository from the origin remote (`--detect`
is on by default). If detection fails, add
`--organization https://dev.azure.com/<org> --project <project>` from the
`ado` block, and `--repository <repo>` from the remote path.

PR commands address a PR by its numeric `<id>`, which `pr.view-base`
returns. Never use `--bypass-policy`, `--auto-complete` or
`--delete-source-branch`.

An operation whose command is `—` is not available on Azure DevOps in this
plugin version: stop and report it — never substitute another platform's
command.

## Detection

Used only when no platform config exists: read `git remote get-url origin`.

- Host `dev.azure.com`, `ssh.dev.azure.com`, `*.visualstudio.com` or
  `vs-ssh.visualstudio.com` → Azure DevOps.
- Host contains `github.com` → GitHub (`adapters/vcs/github.md`).
- Host contains `gitlab` → GitLab (`adapters/vcs/gitlab.md`).
- Ambiguous → fall back to whichever CLI is installed (`command -v gh` /
  `command -v glab` / `command -v az`). If the needed CLI is missing, stop and
  report.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `az devops project list --organization https://dev.azure.com/<org> --top 1 -o none` | a real API call: passes for both `az login` and a PAT, fails without the extension. Error → stop with "Run `az extension add --name azure-devops`, then `az login` (or `az devops login` with a PAT), and re-run." |
| `repo.view` | `—` | project bootstrap supports GitHub only |
| `repo.create` | `—` | project bootstrap supports GitHub only |
| `pr.create-draft` | `az repos pr create --draft true --source-branch <branch> --title "<ID>: <title>" --description <line> <line> … -o json` | pass the body per `## Magic words` as **one argument per line** — `--description` joins its values with newlines; with `tracker: ado` add `--work-items <n>` |
| `pr.view` | `az repos pr list --source-branch <branch> --status active --query "[0].{title:title,description:description,base:targetRefName}" -o json` | the PR's stated intent; read-only |
| `pr.diff` | `—` | `az` has no PR diff; read the change with `git diff` over the range instead |
| `pr.review-comments` | `az devops invoke --area git --resource pullRequestThreads --route-parameters project=<project> repositoryId=<repo> pullRequestId=<id> --organization https://dev.azure.com/<org> --http-method GET --api-version 7.1 -o json` | `<id>` from `pr.view-base`. `<repo>` from `az repos show --query id -o tsv`. Keep a thread whose `threadContext` is present; a thread without it is the PR conversation. Thread id is `id`. Author `comments[].author.displayName`, text `comments[].content`, place `threadContext.filePath` and `threadContext.rightFileEnd.line`. Not run: `az` is not installed on this machine. Command from the Azure DevOps REST 7.1 threads API via `az devops invoke` |
| `pr.review-reply` | `az devops invoke --area git --resource pullRequestThreadComments --route-parameters project=<project> repositoryId=<repo> pullRequestId=<id> threadId=<thread> --organization https://dev.azure.com/<org> --http-method POST --api-version 7.1 --in-file <file> -o json` | `<file>` is `{"content":"<text>","parentCommentId":<comment>,"commentType":1}`, `<comment>` the first comment id of the thread. The body carries no thread status, so the thread stays as it is. Not run, for the same reason as `pr.review-comments` |
| `pr.edit-body` | `az repos pr update --id <id> --description <line> <line> … -o none` | replaces the whole description of the PR; pass it as **one argument per line**, as `pr.create-draft` does, with `""` for a blank line. `<id>` from `pr.view-base`. Azure DevOps rejects a description longer than 4000 characters. Not run, for the same reason as `pr.review-comments` |
| `pr.comment` | `az devops invoke --area git --resource pullRequestThreads --route-parameters project=<project> repositoryId=<repo> pullRequestId=<id> --organization https://dev.azure.com/<org> --http-method POST --api-version 7.1 --in-file <file> -o json` | a new thread with one comment in the PR conversation, with no file context. `<file>` is `{"comments":[{"parentCommentId":0,"content":"<text>","commentType":1}]}`; `<id>` and `<repo>` as in `pr.review-comments`. The body carries no thread status. Not run, for the same reason as `pr.review-comments` |
| `pr.list-merged` | `az repos pr list --status completed --top 5 --query "[].{id:pullRequestId,title:title,source:sourceRefName}" -o json` | the last merged PRs; read-only |
| `pr.view-base` | `az repos pr list --source-branch <branch> --status active --query "[0].{id:pullRequestId,base:targetRefName,isDraft:isDraft}" -o json` | read **before** merging: `base` without its `refs/heads/` prefix is the branch to switch to afterwards; `id` feeds `pr.mark-ready` and `pr.merge` |
| `pr.mark-ready` | `az repos pr update --id <id> --draft false -o none` | only when `isDraft` is `true` — Azure DevOps refuses to complete a draft |
| `pr.merge` | `az repos pr update --id <id> --status completed --squash false -o none` | a **merge commit** is the only method this workflow uses. A branch policy (required reviewers, build) that blocks completion → stop and report it; never bypass it |

## Magic words

Linear has no Azure DevOps integration, so no word in the description links
the PR or closes the issue. The description still starts with the line
`Fixes <ID>` (one line per issue if the PR closes several), followed by the
issue URL from the tracker adapter's `## URL` section, a blank line, then the
summary:

```
Fixes <ID>
<issue URL>

<one-paragraph summary>
```

As arguments: `--description "Fixes <ID>" "<issue URL>" "" "<summary>"`.

The close-out sets the issue to Done explicitly.

With `tracker: ado` the ID is the work item's: the description is `Fixes #<n>`,
a blank line and the summary — no URL line, since `--work-items <n>` links the
work item to the PR (its Development section) and ADO links commits whose
message mentions `#<n>`:

```
Fixes #<n>

<one-paragraph summary>
```

As arguments: `--work-items <n> --description "Fixes #<n>" "" "<summary>"`.
When the PR completes, `Fixes #<n>` moves the work item to its `Completed`
state and the board's last column — the link alone does not. The close-out
writes `done` anyway; writing the column the item already sits in succeeds.

## URL

`az repos pr create` prints no URL. Build it from its JSON output as
`<repository.webUrl>/pullrequest/<pullRequestId>`.
