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
| `pr.create-draft` | `az repos pr create --draft true --source-branch <branch> --title "<ID>: <title>" --description <line> <line> … -o json` | pass the body per `## Magic words` as **one argument per line** — `--description` joins its values with newlines |
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

## URL

`az repos pr create` prints no URL. Build it from its JSON output as
`<repository.webUrl>/pullrequest/<pullRequestId>`.
