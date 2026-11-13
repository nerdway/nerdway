# Tracker adapter: GitHub Issues

Selected by `tracker: github` in the platform config. Identifiers come from
the config's `github` block: `<CODE_REPO>` = `github.owner/github.repo`, the
repo the project's code and PRs live in. `<REPO>` is the repo holding the
issue — `<CODE_REPO>` for `#123`, the named repo for `owner/repo#123` (see
`## Issue ID`). `<n>` is the issue number without `#`.

GitHub Issues has no team or project container on this axis: the repo is the
container, so `team.*` and `project.create` are `—`. An optional GitHub
Project (v2), `github.project` in the platform config, holds the Status
field used by the `native` strategy. `label` stays the default.

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
  a branch) and **Pull requests: read and write**. Driving a Project Status
  field also needs **Projects: read and write** (classic: `project` or
  `read:project` + `write:project`).
- **Projects (v2).** `gh project list --owner <github.owner> --format json
  --limit 100` lists the owner's projects (`number`, `title`, `url`).
  `determine-platform` records `github.project` (that number) when the
  tracker is GitHub Issues and the repo uses a Project. `gh project
  field-list <github.project> --owner <github.owner> --format json` lists
  fields; Status is a `ProjectV2SingleSelectField` with `options[].id` and
  `options[].name`. `gh project item-add <github.project> --owner
  <github.owner> --url <issue url>` puts an issue on the board.
  `updateProjectV2Field` **replaces** the Status option list: every write
  must send existing options with their ids, then snapshot every item's
  Status, verify after, and re-apply.

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
| `project.list` | — | the repo is the container; GitHub Projects (v2) are `github.project`, listed with `gh project list` in `## CLI`, not this operation |
| `project.create` | — | the repo is the container; this skill does not create GitHub Projects |
| `issue.read` | `gh issue view <n> -R <REPO> --json number,title,body,state,labels,comments,url` | state, labels, full body and every comment in one JSON; `/pull/` in `url` → stop |
| `issue.read-relations` | `gh issue view <n> -R <REPO> --json number,title,state,url,parent,subIssues,blockedBy,blocking` | parent and sub-issues are native; run it again on the parent to reach the siblings |
| `issue.read-status` | the read recipe of the resolved strategy in `## Status strategies` | the issue's canonical phase; cheap enough to run every turn |
| `issue.read-branch` | `gh issue view <n> -R <REPO> --json number,title,state,url`, then the branch-name recipe below | `<ID>` = `#<n>` (or `owner/repo#<n>`), `<title>`, `<url>`, `<branchName>` |
| `issue.url` | the recipe in `## URL` | the issue link to print for the human; `url` from any issue JSON already read, else built |
| `issue.create-branch` | the create-branch recipe below | `gh issue develop` links the branch to the issue; stops when `<branchName>` exists locally or on `origin` |
| `issue.resolve-from-branch` | the loop below | prints `#<n>`, nothing when the branch carries no issue number |
| `issue.list-active` | `label`: `gh issue list -R <CODE_REPO> --state open --search 'label:"<map.todo>","<map.in-progress>","<map.in-review>"' --limit 200 --json number,title,labels,url` | under `native`: the project-items recipe below, keeping issues whose Status name is `map.todo`, `map.in-progress` or `map.in-review`. Under `comment`: `gh issue list -R <CODE_REPO> --state open --limit 200 --json number,title,url` and keep the issues whose phase (`issue.read-status`) is `todo`, `in-progress` or `in-review` |
| `issue.list-open` | `label`: `gh issue list -R <CODE_REPO> --state open --limit 200 --json number,title,labels,url` | every open issue, Backlog included, in tracker order; the phase is read as the `label` row of `## Status strategies` does (the mapped name among `labels[].name`, none → `open`, which is `backlog` under the default map); a value the map does not hold, such as `open` under a map that binds `backlog` to a label, is phase unknown and that issue is dropped. Under `native`: the project-items recipe below, keeping issues whose Status name is `map.backlog`, `map.todo`, `map.in-progress` or `map.in-review` (a closed issue is `done` and dropped). Under `comment`: the same open list, keeping the issues whose phase (`issue.read-status`) is `backlog`, `todo`, `in-progress` or `in-review` |
| `issue.create` | `gh issue create -R <CODE_REPO> --title "<title>" --body-file body.md` | add `--label '<map.backlog>'` only under `label` with a label (not `open`) mapped to `backlog`; `<ID>` = `#` + the last segment of the printed URL. Under `native`: then `gh project item-add <github.project> --owner <github.owner> --url <issue url>` and `issue.set-status` with `backlog` unless the new item already reads as `backlog` |
| `issue.create-child` | `gh issue create -R <CODE_REPO> --title "<title>" --body-file body.md --parent <PARENT-n>` | native sub-issue; same `--label` rule as `issue.create`; create the parent first |
| `issue.add-blocked-by` | `gh api --method POST repos/<REPO>/issues/<n>/dependencies/blocked_by -F issue_id="$(gh api repos/<REPO>/issues/<m> --jq .id)"` | `#<n>` is blocked by `#<m>`; native issue dependencies, read back as `blockedBy` by `issue.read-relations`; `issue_id` takes the blocking issue's database `id`, not its number |
| `issue.update-description` | `gh issue edit <n> -R <REPO> --body-file body.md` | replaces the whole body |
| `issue.set-status` | the write recipe of the resolved strategy in `## Status strategies` | writes a canonical phase; never `in-progress` on the agent's own initiative |
| `issue.comment` | `gh issue comment <n> -R <REPO> --body-file body.md` | markdown body |
| `issue.relate` | `gh issue comment <n> -R <REPO> --body "Related: <OTHER-ID>"` | GitHub has no `related` relation; the comment is the documented equivalent, and the mention puts a cross-reference on the other issue's timeline. `<OTHER-ID>` as `#<m>`, or `owner/repo#<m>` in another repo |
| `status.list` | the Status-options recipe below | when `github.project` is set, the project's Status option names; otherwise GitHub issues have only open/closed and phases live in labels or marker comments |
| `label.list` | `gh label list -R <CODE_REPO> --limit 500 --json name` | the repo's labels |
| `label.create` | `gh label create "<name>" -R <CODE_REPO>` | only with the user's consent; exit 1 when it already exists |
| `board.rights` | the rights recipe below | `{ native, label, reason }`: `native` from the project's `viewerCanUpdate`; `label` from repo `permissions.push` |
| `status.create` | the Status-option create recipe below | add one option to the project's Status field; snapshot every item's Status first, verify after, re-apply the snapshot if any item lost its value. Only with the user's consent |

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

Rights recipe for `board.rights`. `label` is repo push access; `native` is
the Project's `viewerCanUpdate`. No `github.project` → `native` is
`unknown`. An HTTP 403/404 without a clear boolean → `unknown`, never a
trial write.

```bash
push=$(gh api repos/<CODE_REPO> --jq .permissions.push 2>/dev/null) || push=""
# "$push" = true → label yes; false → label no; empty → label unknown

gh api graphql -f owner="<github.owner>" -F number=<github.project> -f query='
query($owner: String!, $number: Int!) {
  organization(login: $owner) { projectV2(number: $number) { id viewerCanUpdate } }
  user(login: $owner) { projectV2(number: $number) { id viewerCanUpdate } }
}'
```

Take `organization.projectV2` when it is non-null, otherwise
`user.projectV2`. `viewerCanUpdate` true → `native` yes; false → `native`
no; both null or a GraphQL error → `native` unknown.

Status-options recipe for `status.list` (requires `github.project`):

```bash
gh project field-list <github.project> --owner <github.owner> --format json \
  | jq -r '.fields[] | select(.name == "Status") | .options[]?.name'
```

Project-items recipe for `issue.list-active` / `issue.list-open` under
`native` — paginate while `hasNextPage` is true. Keep items whose
`content` is an Issue in `<CODE_REPO>` (drop pull requests and draft
issues). Closed issues are `done` and never listed.

```bash
gh api graphql -f owner="<github.owner>" -F number=<github.project> -f query='
query($owner: String!, $number: Int!, $cursor: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        nodes {
          content { ... on Issue { number title url state repository { nameWithOwner } } }
          fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}'
```

If the organisation field is null, repeat the query with `user(login:
$owner)` in place of `organization`. Filter `repository.nameWithOwner ==
"<CODE_REPO>"`.

Status-option create recipe for `status.create` — only with the user's
consent, one option per call, never a trial write. `<name>` is the option
to add (e.g. `In Review`). `<color>` is one of `GRAY`, `BLUE`, `GREEN`,
`YELLOW`, `ORANGE`, `RED`, `PINK`, `PURPLE`.

1. Resolve the project node id and the Status field (organisation, then
   user), and snapshot every item's Status `optionId`:

```bash
gh api graphql -f owner="<github.owner>" -F number=<github.project> -f query='
query($owner: String!, $number: Int!, $cursor: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      id
      field(name: "Status") {
        ... on ProjectV2SingleSelectField { id name options { id name color } }
      }
      items(first: 100, after: $cursor) {
        nodes {
          id
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { optionId name }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}'
```

2. Build `singleSelectOptions`: every existing option with its `id`,
   `name` and `color`, then `{ name: "<name>", color: <color> }` without
   an id. `updateProjectV2Field` **replaces** the list; omitting an id
   clears that option on every item.

```bash
gh api graphql -f fieldId="$FIELD_ID" -f query='
mutation($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) {
    projectV2Field { ... on ProjectV2SingleSelectField { options { id name } } }
  }
}' -f options="$OPTIONS_JSON"
```

Pass `-f options="$OPTIONS_JSON"` only when the CLI accepts a JSON array
variable; otherwise inline the array in the mutation (existing options
must keep their `id`s). HTTP 403 → stop, drop one cascade level, ask
again. Do not retry.

3. Re-read every item's Status. Any snapshot id whose Status is now empty
   lost its value: re-apply with
   `gh project item-edit --id <item-id> --project-id <project-id> --field-id <field-id> --single-select-option-id <optionId>`
   once per lost item. Diff the snapshot against the re-read; a mismatch
   after re-apply is a failure — stop and report it.

## Children on close

The children are the `subIssues` of `issue.read-relations`; read each one's
phase with `issue.read-status`.

Closing a parent issue on GitHub, by hand or through `Fixes #<n>` on a merged
PR, leaves its sub-issues open; GitHub only shows their progress on the
parent. Nothing closes a child unless a repository workflow does it.

## URL

Take the link from the issue JSON's `url` field. Without it, build
`https://github.com/<REPO>/issues/<n>`.

## Statuses

GitHub issues are only open or closed, so the default strategy is `label`:
one `status::<phase>` label per middle phase, `open` for `backlog` and
`closed` for `done` — a PR merged with `Fixes #<n>` closes the issue and so
lands on `done` with no label write. The three labels do not exist in a new
repo; `board-setup` creates them with the user's consent.

`native` is supported when `github.project` names a Project (v2): phases
are the project's Status options. Stock projects ship Todo / In Progress /
Done; `board-setup` adds the missing options (typically Backlog and In
Review). A closed issue still reads as `done` regardless of the Status
option, so a merged `Fixes #<n>` lands on `done` without a Status write;
`issue-close` also sets the Done option.

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

`<value>` is `map[<phase>]`; the value read back is looked up in the map,
following the rules of `adapters/statuses.md`. `native` is the project's
Status field; `label` stays the default. The `native` recipes are spelled
out below the table.

| Strategy | Read | Write |
|----------|------|-------|
| `native` | the Status read below | the Status write below |
| `label` | `gh issue view <n> -R <REPO> --json number,title,state,labels,url` — `state` `CLOSED` → value `closed`; `OPEN` → the mapped names among `labels[].name`, none → `open` | `closed` → `gh issue close <n> -R <REPO>`; otherwise `gh issue edit <n> -R <REPO> --remove-label '<mapped label on the issue>'` once per other mapped label the read found, plus `--add-label '<value>'` unless `<value>` is `open`, then `gh issue reopen <n> -R <REPO>` when the read found `CLOSED` |
| `comment` | `gh issue view <n> -R <REPO> --json number,title,url,comments` — sort by `createdAt`, newest first, keep the bodies whose first line is `Status: <value>`; for each in turn run `gh api repos/<REPO>/collaborators/<author.login>/permission --jq .permission` and take the first whose author has `admin` or `write`; a `read`/`none` author or a 404 skips that marker; a 403 → stop, phase unknown (the caller cannot verify authors) | `gh issue comment <n> -R <REPO> --body "Status: <value>"` |

Status read — a closed issue is `closed` (phase `done`) regardless of the
Status option. Otherwise the value is the issue's Status name on
`github.project`; not on that project → phase unknown, report it.

```bash
state=$(gh issue view <n> -R <REPO> --json state,url --jq .state)
[ "$state" = "CLOSED" ] && { echo closed; exit 0; }
url=$(gh issue view <n> -R <REPO> --json url --jq .url)
gh api graphql -f url="$url" -F number=<github.project> -f query='
query($url: URI!, $number: Int!) {
  resource(url: $url) {
    ... on Issue {
      projectItems(first: 20) {
        nodes {
          project { number }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
        }
      }
    }
  }
}' | jq -r --argjson n <github.project> '.data.resource.projectItems.nodes[] | select(.project.number == $n) | .fieldValueByName.name // empty'
```

Status write — add the issue to the project when it is not on it, then set
the Status option. `done` also closes the issue (`gh issue close`), so a
merged `Fixes #<n>` and an explicit close agree. Look the option id up in
`status.list` / `field-list`; `<value>` is `map[<phase>]`.

```bash
url=$(gh issue view <n> -R <REPO> --json url --jq .url)
gh project item-add <github.project> --owner <github.owner> --url "$url" >/dev/null 2>&1 || true
option=$(gh project field-list <github.project> --owner <github.owner> --format json \
  | jq -r --arg v "<value>" '.fields[] | select(.name == "Status") | .options[] | select(.name == $v) | .id')
[ -n "$option" ] || { echo "Status option <value> does not exist — run /board-setup" >&2; exit 1; }
gh project item-edit --owner <github.owner> <github.project> --url "$url" --field-id "$(
  gh project field-list <github.project> --owner <github.owner> --format json \
    | jq -r '.fields[] | select(.name == "Status") | .id'
)" --single-select-option-id "$option"
```

HTTP 403 → stop, drop one cascade level, ask again. For `closed` /
`done`, then `gh issue close <n> -R <REPO>`. For any other phase, `gh
issue reopen <n> -R <REPO>` when the issue is closed.

Under `comment` anyone who can see an issue can comment on it, so a marker
counts only when its author has write access to the repo — the rule of
`adapters/statuses.md`. `authorAssociation` cannot tell that: `MEMBER` is any
member of the owning organisation and `COLLABORATOR` includes read-only
collaborators, so the recipe asks the permissions endpoint instead, usually
once per read (the newest marker's author).

## Bugs

A bug is an issue with the label `bug`, one of the labels GitHub creates in
every new repo. Look for it in `label.list`; when it is there,
`issue.create` gets `--label bug`. When it is missing (the repo deleted or
renamed it), ask before running `label.create` for it.
