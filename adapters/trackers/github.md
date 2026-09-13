# Tracker adapter: GitHub Issues

Selected by `tracker: github` in the platform config. Identifiers come from
the config's `github` block: `<CODE_REPO>` = `github.owner/github.repo`, the
repo the project's code and PRs live in. `<REPO>` is the repo holding the
issue — `<CODE_REPO>` for `#123`, the named repo for `owner/repo#123` (see
`## Issue ID`). `<n>` is the issue number without `#`.

GitHub Issues has no team or project container on this axis: the repo is the
container, so `team.*` and `project.*` are `—`. GitHub Projects boards are not
used.

## CLI

`gh` is the GitHub CLI. Pass `-R <REPO>` on every issue and label command, so
the result never depends on the checkout's remote. Never use `--force` or
confirmation-bypassing flags.

- **`gh issue view` accepts a pull request number** and returns the PR with
  exit 0 (`url` ends in `/pull/<n>`). Every read that takes an issue number
  requests `url` and stops when it contains `/pull/`: "#<n> is a pull
  request, not an issue". `gh issue develop` and `gh issue edit` reject a PR
  number on their own.
- A number that exists nowhere fails with exit 1: `Could not resolve to an
  issue or pull request with the number of <n>`.
- Multi-line bodies go through `--body-file body.md` (`gh issue create`,
  `gh issue edit`, `gh issue comment`); newlines, backticks, markdown and
  Polish diacritics survive as-is. A one-line body may use `--body "<text>"`.
- `gh issue create` prints only the new issue URL; the number is its last
  path segment.
- `--json` fields used here: `number,title,body,state,labels,comments,url`;
  `state` is `OPEN` or `CLOSED`; each comment carries `author.login`,
  `authorAssociation`, `createdAt` and `body`. Relations: `parent`,
  `subIssues`, `blockedBy`, `blocking` (`gh` ≥ 2.94).
- `gh issue edit --remove-label <name>` is a no-op for a label the issue does
  not carry, but **fails** (`'<name>' not found`, exit 1) for a label that
  does not exist in the repo — remove only labels read from the issue.
- `gh api repos/<REPO>/collaborators/<login>/permission --jq .permission`
  gives the author's access to the repo: `admin`, `write` (maintainers
  included), `read` (triage included) or `none`. It exits 1 with HTTP 404 for
  a deleted account, and with HTTP 403 when the caller itself has no push
  access to `<REPO>`.
- `gh issue close` / `gh issue reopen` on an issue already in that state
  print a `!` warning and exit 0.
- `gh label create` fails (exit 1) when the label already exists.
- `gh issue list --label a --label b` means **a and b**; an OR over labels
  goes through `--search 'label:"a","b"'`.
- `gh issue list` (with `--label` or `--search`) reads a search index that
  trails a label write by a few seconds; `gh issue view` is immediate. Read
  one issue's phase with `issue.read-status`, never by listing.
- **`gh issue develop` does not fail when the branch already exists** — it
  exits 0 and checks the existing branch out. Its `--list` stops showing a
  linked branch once a PR is open from it, so it cannot tell whether a branch
  exists either; `issue.create-branch` checks git itself.
- `gh issue develop` creates the branch **on the remote**, from
  `origin/<base>`: commits on the local `<base>` that are not pushed are not
  in the new branch.
- Its default branch name keeps diacritics (`5-poprawa-zażółć`), so this
  adapter always passes `--name` with an ASCII name from `issue.read-branch`.
- Token scopes: a classic token from `gh auth login` needs `repo`
  (`read:org` for organisation repos). A fine-grained token needs **Issues:
  read and write**, **Contents: read and write** (`gh issue develop` creates
  a branch) and **Pull requests: read and write**.

## Issue ID

Recognised only when the platform config says `tracker: github` — elsewhere
`#123` is just a number in prose.

- `#123` — an issue in `<CODE_REPO>`; `<REPO>` = `<CODE_REPO>`.
- `owner/repo#123` — an issue in another repo; `<REPO>` = `owner/repo`.
  The branch and the PR still go to `<CODE_REPO>`.
- A bare `123`, or a PR number, is not an issue ID: a number whose `url`
  contains `/pull/` is rejected (see `## CLI`).

The ID is written `#123` (or `owner/repo#123`) wherever a skill writes
`<ID>` — PR titles, commit messages, the `Fixes <ID>` magic word.

`issue.resolve-from-branch` reads the leading number of the branch name
(`123-some-title`), the shape `issue.read-branch` produces, and keeps it only
when it resolves to an issue in `<CODE_REPO>`. A branch with no leading
number resolves to nothing: stop and ask the user for the ID — never guess
it.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `gh auth status` | exit 0 → installed and authenticated; scopes in `## CLI` |
| `team.list` | — | the repo is the container; no team to pick |
| `team.check` | — | the repo is the container; no team to pick |
| `project.list` | — | the repo is the container; GitHub Projects are not used |
| `project.create` | — | the repo is the container; GitHub Projects are not used |
| `issue.read` | `gh issue view <n> -R <REPO> --json number,title,body,state,labels,comments,url` | state, labels, full body and every comment in one JSON; `/pull/` in `url` → stop |
| `issue.read-relations` | `gh issue view <n> -R <REPO> --json number,title,state,url,parent,subIssues,blockedBy,blocking` | parent and sub-issues are native; run it again on the parent to reach the siblings |
| `issue.read-status` | the read recipe of the resolved strategy in `## Status strategies` | the issue's canonical phase; cheap enough to run every turn |
| `issue.read-branch` | `gh issue view <n> -R <REPO> --json number,title,state,url`, then the branch-name recipe below | `<ID>` = `#<n>` (or `owner/repo#<n>`), `<title>`, `<url>`, `<branchName>` |
| `issue.create-branch` | the create-branch recipe below | `gh issue develop` links the branch to the issue; stops when `<branchName>` exists locally or on `origin` |
| `issue.resolve-from-branch` | the loop below | prints `#<n>`, nothing when the branch carries no issue number |
| `issue.list-active` | `label`: `gh issue list -R <CODE_REPO> --state open --search 'label:"<map.todo>","<map.in-progress>","<map.in-review>"' --limit 200 --json number,title,labels,url` | under `comment`: `gh issue list -R <CODE_REPO> --state open --limit 200 --json number,title,url` and keep the issues whose phase (`issue.read-status`) is `todo`, `in-progress` or `in-review` |
| `issue.create` | `gh issue create -R <CODE_REPO> --title "<title>" --body-file body.md` | add `--label '<map.backlog>'` only under `label` with a label (not `open`) mapped to `backlog`; `<ID>` = `#` + the last segment of the printed URL |
| `issue.create-child` | `gh issue create -R <CODE_REPO> --title "<title>" --body-file body.md --parent <PARENT-n>` | native sub-issue; same `--label` rule as `issue.create`; create the parent first |
| `issue.update-description` | `gh issue edit <n> -R <REPO> --body-file body.md` | replaces the whole body |
| `issue.set-status` | the write recipe of the resolved strategy in `## Status strategies` | writes a canonical phase; never `in-progress` on the agent's own initiative |
| `issue.comment` | `gh issue comment <n> -R <REPO> --body-file body.md` | markdown body |
| `status.list` | — | GitHub issues have only open/closed; phases live in labels or marker comments |
| `label.list` | `gh label list -R <CODE_REPO> --limit 500 --json name` | the repo's labels |
| `label.create` | `gh label create "<name>" -R <CODE_REPO>` | only with the user's consent; exit 1 when it already exists |

Branch-name recipe for `issue.read-branch` — the ASCII name `<n>-<title
slug>`, at most 50 slug characters; the same title always yields the same
name:

```bash
node -e 'const [n,t]=process.argv.slice(1);const s=t.normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[łŁ]/g,"l").replace(/[đĐ]/g,"d").replace(/[øØ]/g,"o").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,50).replace(/^-+|-+$/g,"");console.log(s?`${n}-${s}`:n)' "<n>" "<title>"
```

Create-branch recipe for `issue.create-branch` (`<base>` is the branch the
caller starts from; it must be pushed):

```bash
if git show-ref --verify --quiet "refs/heads/<branchName>" || git ls-remote --exit-code --heads origin "<branchName>" >/dev/null; then
  echo "branch <branchName> already exists" >&2; exit 1
fi
gh issue develop <n> -R <REPO> --branch-repo <CODE_REPO> --base <base> --name "<branchName>" --checkout
```

`issue.resolve-from-branch`:

```bash
n=$(git branch --show-current | grep -oE '^[0-9]+')
[ -n "$n" ] && gh issue view "$n" -R <CODE_REPO> --json url --jq .url 2>/dev/null | grep -q '/issues/' && echo "#$n"
```

## URL

Take the link from the issue JSON's `url` field. Without it, build
`https://github.com/<REPO>/issues/<n>`.

## Statuses

GitHub issues are only open or closed, so the default strategy is `label`:
one `status::<phase>` label per middle phase, `open` for `backlog` and
`closed` for `done` — a PR merged with `Fixes #<n>` closes the issue and so
lands on `done` with no label write. The three labels do not exist in a new
repo; `bind-statuses` creates them with the user's consent.

Default strategy and map, used when the platform config has no `statuses`
block (semantics in `adapters/statuses.md`):

```yaml
strategy: label
map:
  backlog: open
  todo: status::todo
  in-progress: status::in-progress
  in-review: status::in-review
  done: closed
```

## Status strategies

GitHub issues carry no state field beyond open/closed, so `native` is not
supported. `<value>` is `map[<phase>]`; the value read back is looked up in
the map, following the rules of `adapters/statuses.md`.

| Strategy | Read | Write |
|----------|------|-------|
| `native` | — | — |
| `label` | `gh issue view <n> -R <REPO> --json number,title,state,labels,url` — `state` `CLOSED` → value `closed`; `OPEN` → the mapped names among `labels[].name`, none → `open` | `closed` → `gh issue close <n> -R <REPO>`; otherwise `gh issue edit <n> -R <REPO> --remove-label '<mapped label on the issue>'` once per other mapped label the read found, plus `--add-label '<value>'` unless `<value>` is `open`, then `gh issue reopen <n> -R <REPO>` when the read found `CLOSED` |
| `comment` | `gh issue view <n> -R <REPO> --json number,title,url,comments` — sort by `createdAt`, newest first, keep the bodies whose first line is `Status: <value>`; for each in turn run `gh api repos/<REPO>/collaborators/<author.login>/permission --jq .permission` and take the first whose author has `admin` or `write`; a `read`/`none` author or a 404 skips that marker; a 403 → stop, phase unknown (the caller cannot verify authors) | `gh issue comment <n> -R <REPO> --body "Status: <value>"` |

Under `comment` anyone who can see an issue can comment on it, so a marker
counts only when its author has write access to the repo — the rule of
`adapters/statuses.md`. `authorAssociation` cannot tell that: `MEMBER` is any
member of the owning organisation and `COLLABORATOR` includes read-only
collaborators, so the recipe asks the permissions endpoint instead, usually
once per read (the newest marker's author).
