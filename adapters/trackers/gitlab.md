# Tracker adapter: GitLab Issues

Selected by `tracker: gitlab` in the platform config. Identifiers come from
the config's `gitlab` block and the checkout:

- `<HOST>` — the host of `git remote get-url origin` when it contains
  `gitlab` (a self-managed instance), otherwise `gitlab.com`.
- `<CODE_PROJECT>` — `gitlab.group/gitlab.project` (subgroups stay in
  `group`), the project the code and MRs live in.
- `<PROJECT>` — the project holding the issue: `<CODE_PROJECT>` for `#123`,
  the named one for `group/project#123` (see `## Issue ID`).
- `<REPO>` — `<HOST>/<PROJECT>`, the value of every `-R`.
- `<ENC>` — `<PROJECT>` with every `/` written `%2F`, for `glab api` paths.
- `<n>` — the issue number (IID) without `#`.

The project is the container, so `team.*` and `project.*` are `—`. Epics,
iterations and boards are not used.

## CLI

`glab` is the GitLab CLI. Pass `-R <REPO>` on every `glab issue` and
`glab label` command and `--hostname <HOST>` on every `glab api` call, so the
result never depends on the checkout's remote — `glab api` has no `-R` and
otherwise resolves `:fullpath` and the host from the current directory. Never
use `--force` or confirmation-bypassing flags other than `--yes` on
`glab issue create`.

- `glab api` has **no `--jq` flag** (unlike `gh api`); pipe its output
  through `jq`.
- `glab issue create` prints the new issue URL as its last line; the number is
  its last path segment. gitlab.com URLs read `/-/work_items/<n>`; older
  self-managed instances print `/-/issues/<n>`.
- Multi-line bodies go through `--description-file body.md` (`glab issue
  create`, `glab issue update`) and `--message "$(cat body.md)"` (`glab issue
  note`, which has no file flag); newlines, backticks, markdown and Polish
  diacritics survive as-is.
- `glab issue view <n> --output json` carries `iid`, `title`, `description`,
  `state` (`opened` or `closed`), `labels` (names) and `web_url`. A number
  that is not an issue fails with `404 Not Found`, exit 1. MR numbers are a
  separate sequence, so an issue number never resolves to an MR.
- `glab issue view -c` returns at most 20 notes (in `Notes`). Notes are read
  through `glab api "projects/<ENC>/issues/<n>/notes?…" --paginate`, which
  follows every page and prints one merged JSON array. Each note carries
  `system` (`true` for GitLab's own activity lines), `created_at`,
  `author.id`, `author.username` and `body`.
- **Adding a label that does not exist creates it** — `glab issue update
  --label` and `glab issue create --label` both exit 0 and add the label to
  the project. Every label write first checks the name against
  `label.list`, so a label never appears without the user's consent.
- `glab issue update --unlabel <name>` is a no-op (exit 0) for a label the
  issue does not carry and for a label that does not exist. `--unlabel` and
  `--label` combine in one call.
- `status::` labels are **not** mutually exclusive on the Free tier: an issue
  can carry `status::todo` and `status::in-progress` at once. Scoped-label
  exclusivity is a Premium feature, so the `label` write removes the other
  mapped labels itself.
- `glab issue close` / `glab issue reopen` on an issue already in that state
  exit 0.
- `glab label create` fails with HTTP 409 `Label already exists`, exit 1.
- `glab issue list --label a --label b` means **a and b** and there is no OR;
  `issue.list-active` lists open issues and filters labels in `jq`.
- `glab issue create --linked-issues <p>` **creates the issue before linking
  it**: when the link fails (unknown `<p>`: `404 Not Found`, exit 1) the issue
  already exists, no URL is printed, and a recovery file is written under
  `glab-cli/recover/`. `issue.create-child` therefore reads the parent first.
- `glab api "projects/<ENC>/members/all/<user id>"` returns the member with
  `access_level` (10 Guest, 15 Planner, 20 Reporter, 30 Developer,
  40 Maintainer, 50 Owner), inherited group members included; a user who is
  not a member (or does not exist) fails with HTTP 404, exit 1.
- Token scopes: the token from `glab auth login` needs `api` (issue, label
  and note writes, `glab api`) and `write_repository` (push).

## Issue ID

Recognised only when the platform config says `tracker: gitlab` — elsewhere
`#123` is just a number in prose.

- `#123` — an issue in `<CODE_PROJECT>`; `<PROJECT>` = `<CODE_PROJECT>`.
- `group/project#123` — an issue in another project on the same host;
  `<PROJECT>` = `group/project`. The branch and the MR still go to
  `<CODE_PROJECT>`.
- `!123` is a merge request, never an issue ID.

The ID is written `#123` (or `group/project#123`) wherever a skill writes
`<ID>` — MR titles, commit messages, the `Fixes <ID>` magic word.

`issue.resolve-from-branch` reads the leading number of the branch name
(`123-some-title`), the shape `issue.read-branch` produces and GitLab's own
default branch template (`%{id}-%{title}`), and keeps it only when it
resolves to an issue in `<CODE_PROJECT>`. A branch with no leading number
resolves to nothing: stop and ask the user for the ID — never guess it.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `glab auth status --hostname <HOST>` | exit 0 → installed and authenticated on `<HOST>`; scopes in `## CLI` |
| `team.list` | — | the project is the container; no team to pick |
| `team.check` | — | the project is the container; no team to pick |
| `project.list` | — | the project is the container, taken from the `gitlab` block |
| `project.create` | — | the project is the container, taken from the `gitlab` block |
| `issue.read` | `glab issue view <n> -R <REPO> --output json`, then the notes recipe below | state, labels, full description, then every note; an issue's JSON plus the note array |
| `issue.read-relations` | `glab issue view <n> -R <REPO> --output json`, then the relations recipe below | parent, children and other linked issues, told apart by the `Parent: #<n>` first line |
| `issue.read-status` | the read recipe of the resolved strategy in `## Status strategies` | the issue's canonical phase; cheap enough to run every turn |
| `issue.read-branch` | `glab issue view <n> -R <REPO> --output json`, then the branch-name recipe below | `<ID>` = `#<n>` (or `group/project#<n>`), `<title>`, `<url>` = `web_url`, `<branchName>` |
| `issue.create-branch` | the create-branch recipe below | from the current checkout, which the caller has already put on `<base>`; stops when `<branchName>` exists locally or on `origin` |
| `issue.resolve-from-branch` | the loop below | prints `#<n>`, nothing when the branch carries no issue number |
| `issue.list-active` | the active-list recipe below | open issues in `<CODE_PROJECT>` whose phase is `todo`, `in-progress` or `in-review` |
| `issue.create` | `glab issue create -R <HOST>/<CODE_PROJECT> --title "<title>" --description-file body.md --yes` | add `--label '<map.backlog>'` only under `label` with a label (not `open`) mapped to `backlog` **and** present in `label.list`; `<ID>` = `#` + the last segment of the printed URL |
| `issue.create-child` | `glab issue view <PARENT-n> -R <HOST>/<CODE_PROJECT> --output json` (must succeed), then `glab issue create -R <HOST>/<CODE_PROJECT> --title "<title>" --description-file body.md --linked-issues <PARENT-n> --link-type relates_to --yes` | `body.md` starts with the line `Parent: #<PARENT-n>`, then a blank line; same `--label` rule as `issue.create`; create the parent first |
| `issue.update-description` | `glab issue update <n> -R <REPO> --description-file body.md` | replaces the whole description; keep a child's `Parent:` first line |
| `issue.set-status` | the write recipe of the resolved strategy in `## Status strategies` | writes a canonical phase; never `in-progress` on the agent's own initiative |
| `issue.comment` | `glab issue note <n> -R <REPO> --message "$(cat body.md)"` | markdown body; prints the note URL |
| `status.list` | — | GitLab issues have only opened/closed; phases live in labels or marker comments |
| `label.list` | `glab api --hostname <HOST> "projects/<ENC>/labels?per_page=100" --paginate` | the project's labels with those inherited from its groups; names in `.[].name` |
| `label.create` | `glab label create -R <HOST>/<CODE_PROJECT> --name "<name>"` | only with the user's consent; HTTP 409, exit 1 when it already exists |

Sub-issues: GitLab Free has no parent/child relation between issues (epics
and child tasks are Premium or work-item-only), so a child is an ordinary
issue linked `relates_to` to its parent, whose description starts with the
line `Parent: #<PARENT-n>`. The link is symmetric; the `Parent:` line is what
tells the parent from a sibling. A child whose `Parent:` line was removed by
hand still shows as a linked issue, without the parent role.

Notes recipe for `issue.read` (newest first):

```bash
glab api --hostname <HOST> "projects/<ENC>/issues/<n>/notes?sort=desc&order_by=created_at&per_page=100" --paginate \
  | jq '[.[] | select(.system | not) | {id, created_at, author: .author.username, author_id: .author.id, body}]'
```

Relations recipe for `issue.read-relations` — each linked issue with its role
towards `<n>`: `parent` when `<n>`'s own description starts with
`Parent: #<iid>`, `child` when the linked issue's description starts with
`Parent: #<n>`, `related` otherwise. Run it again on the parent to reach the
siblings:

```bash
parent=$(glab issue view <n> -R <REPO> --output json | jq -r '.description // "" | split("\n")[0] | capture("^Parent: #(?<p>[0-9]+)$").p // ""')
glab api --hostname <HOST> "projects/<ENC>/issues/<n>/links" \
  | jq --arg n "<n>" --arg parent "$parent" '[.[] | {iid, title, state, ref: .references.full, link_type,
      role: (if (.iid | tostring) == $parent then "parent"
             elif ((.description // "") | split("\n")[0]) == ("Parent: #" + $n) then "child"
             else "related" end)}]'
```

Branch-name recipe for `issue.read-branch` — the ASCII name `<n>-<title
slug>`, at most 50 slug characters; the same title always yields the same
name:

```bash
node -e 'const [n,t]=process.argv.slice(1);const s=t.normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[łŁ]/g,"l").replace(/[đĐ]/g,"d").replace(/[øØ]/g,"o").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,50).replace(/^-+|-+$/g,"");console.log(s?`${n}-${s}`:n)' "<n>" "<title>"
```

Create-branch recipe for `issue.create-branch`:

```bash
if git show-ref --verify --quiet "refs/heads/<branchName>" || git ls-remote --exit-code --heads origin "<branchName>" >/dev/null; then
  echo "branch <branchName> already exists" >&2; exit 1
fi
git checkout -b "<branchName>"
```

`issue.resolve-from-branch`:

```bash
n=$(git branch --show-current | grep -oE '^[0-9]+')
[ -n "$n" ] && glab issue view "$n" -R <HOST>/<CODE_PROJECT> --output json >/dev/null 2>&1 && echo "#$n"
```

Active-list recipe for `issue.list-active` under `label`:

```bash
glab api --hostname <HOST> "projects/<ENC>/issues?state=opened&per_page=100" --paginate \
  | jq '[.[] | select(any(.labels[]; . == "<map.todo>" or . == "<map.in-progress>" or . == "<map.in-review>")) | {iid, title, labels, web_url}]'
```

Under `comment` drop the `select`, then keep the issues whose phase
(`issue.read-status`) is `todo`, `in-progress` or `in-review`. `<ENC>` here
is `<CODE_PROJECT>` encoded.

## URL

Take the link from the issue JSON's `web_url` field. Without it, build
`https://<HOST>/<PROJECT>/-/issues/<n>` — gitlab.com serves it as well as
the `/-/work_items/<n>` form its API returns.

## Statuses

GitLab issues are only opened or closed, so the default strategy is `label`:
one `status::<phase>` label per middle phase, `open` for `backlog` and
`closed` for `done` — an MR merged into the default branch with
`Fixes #<n>` closes the issue and so lands on `done` with no label write. The
three labels do not exist in a new project; `bind-statuses` creates them with
the user's consent.

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

GitLab issues carry no state field beyond opened/closed, so `native` is not
supported. `<value>` is `map[<phase>]`; the value read back is looked up in
the map, following the rules of `adapters/statuses.md`. The `comment` read is
spelled out below the table.

| Strategy | Read | Write |
|----------|------|-------|
| `native` | — | — |
| `label` | `glab issue view <n> -R <REPO> --output json` — `state` `closed` → value `closed`; `opened` → the mapped names among `labels`, none → `open` | `closed` → `glab issue close <n> -R <REPO>`; a label `<value>` (not `open`) missing from `label.list` → stop: "label `<value>` does not exist — run `/bind-statuses`"; otherwise `glab issue update <n> -R <REPO> --unlabel '<mapped label on the issue>'` once per other mapped label the read found, plus `--label '<value>'` unless `<value>` is `open` (skip the update when neither applies), then `glab issue reopen <n> -R <REPO>` when the read found `closed` |
| `comment` | the notes recipe of `issue.read`, then the marker-author check below | `glab issue note <n> -R <REPO> --message "Status: <value>"` |

Marker-author check for the `comment` read. Walk the notes newest first and
keep those whose first line is `Status: <value>`; for each in turn run

```bash
glab api --hostname <HOST> "projects/<ENC>/members/all/<author_id>" | jq .access_level
```

and take the first whose author has `access_level` 30 (Developer) or more. A
lower level or an HTTP 404 (not a member) skips that marker; any other
failure (401, 403) → stop, phase unknown — the caller cannot verify authors.
No marker left → `backlog`.

Under `comment` anyone who can see an issue can comment on it — on a public
project, any signed-in user — so a marker counts only when its author can
push to the project, the rule of `adapters/statuses.md`. Developer is the
lowest role with push access; Guest, Planner and Reporter can comment but not
push. The check usually costs one call per read (the newest marker's author).
