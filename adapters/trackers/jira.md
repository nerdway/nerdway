# Tracker adapter: Jira Cloud

Selected by `tracker: jira` in the platform config. Identifiers come from the
config's `jira` block: `<SITE>` = `jira.site` (hostname only, e.g.
`acme.atlassian.net`), `<PROJECT>` = `jira.project` (the project key, e.g.
`PROJ`), optional `<TYPE>` = `jira.issueType` (the work-item type name as the
project spells it). `<ID>` is a work item key (`PROJ-123`).

Jira Cloud only — Data Center / Server is out of scope. The Jira project is
the container, so `team.*` is `—`. Creating Jira projects is admin work, so
`project.create` is `—`. Jira Service Management, Assets and Advanced
Roadmaps are not used.

## CLI

`acli` is the official Atlassian CLI (Cloud-only). Never use `--web` (OAuth)
or `--editor` as an agent recipe. Mutating commands that prompt take `--yes`.
Parse JSON with `--json` piped through `jq` on Unix, or `ConvertFrom-Json` on
Windows PowerShell; `acli` has no `--jq`. Do not use `grep` in PowerShell
snippets.

- **Auth is any authenticated `acli` session.** The adapter does not care
  whether the session is an API token or `oauth_global` (the type
  `acli jira auth status` prints as `Authentication Type`). The documented
  **headless** login is an **unscoped** Atlassian API token (Create API token
  at https://id.atlassian.com/manage-profile/security/api-tokens, not Create
  API token with scopes): `echo "$ATLASSIAN_API_TOKEN" | acli jira auth
  login --site "<SITE>" --email "<account-email>" --token` reads the token
  from stdin. On PowerShell: `"$env:ATLASSIAN_API_TOKEN" | acli jira auth
  login --site "<SITE>" --email "<account-email>" --token`. `--web` is not
  the agent recipe; a human who already logged in that way is fine. After
  login, commands use that site; `jira.site` must be the hostname that login
  used. Verify the session with `acli jira auth status`.
- `auth.check` is a real API call (`jira project list --limit 1`):
  `acli jira auth status` is not the probe, because an unauthenticated probe
  must fail.
- **`workitem view` takes a positional key**; every other work-item command
  takes `--key`. A missing key fails with a non-zero exit.
- Create and edit take `--description "..."` (confirmed). `--description-file
  body.md` is the acli file equivalent and avoids shell quoting. Comments have
  no file flag: `--body "$(cat body.md)"` (PowerShell: `--body (Get-Content
  -Raw body.md)`) preserves newlines, backticks, markdown and Polish
  diacritics. Descriptions are stored as plain text or ADF, not
  GitHub-flavoured markdown.
- `--json` on create prints the new work item; take `.key`. `--json` on view
  and search carries REST-shaped fields (`fields.status.name`,
  `fields.summary`, `fields.labels`, `fields.status.statusCategory.key`) or a
  flattened `status.name` — recipes accept either.
- **Labels are JSON-only.** `acli jira workitem view <ID> --fields
  summary,status,labels` in text mode does **not** print labels. Read them
  from `--json` at `fields.labels` (an array of strings), never from text
  output. On create the flag is `--label` (comma-separated names); on edit
  it is `--labels` (`acli jira workitem edit --key <ID> --labels a,b --yes`).
- Default list size is 30 and further pages are dropped with no warning.
  Search and project lists pass `--limit 200` (or `--paginate`).
- `workitem transition --status "<name>"` needs a path in the project's
  workflow from the current status to that **localized** name; a missing path
  fails loudly. `--yes` skips the confirm prompt.
  `acli jira workitem transition --key <ID> --status "<actual status name>"
  --yes` is the confirmed write.
- JQL status names with spaces are quoted (`status = "<map.in-progress>"`).
  Never put English names such as `In Progress` into JQL unless the map
  actually holds that string.
- `--parent` on create sets the Cloud parent field (team-managed parent, or
  company-managed Epic/parent). It does not create a Sub-task type unless
  `--type` says so; this adapter creates children of `<TYPE>`.
- On create, add `--label`, `--assignee` only when the user specified them —
  never invent metadata. `--type` is `<TYPE>` from the type-discovery recipe
  (or `jira.issueType`); never assume the English names `Task` or `Bug`.
- Token: an unscoped Atlassian account API token from
  https://id.atlassian.com/manage-profile/security/api-tokens. Never commit
  it, never put it in the platform config. Scoped tokens (Create API token
  with scopes) are a different URL shape and are not this adapter's recipe.
- `acli jira workitem delete --key <ID> --yes` is confirmed to work; this
  adapter has no delete operation and does not call it.

## Issue ID

`PROJ-123` — the configured project key, dash, number. `acli` resolves
`PROJ-123`; recipes upper-case every candidate. Recognised only when the
platform config says `tracker: jira` — elsewhere `PROJ-123` is letters in
prose.

The ID is written `PROJ-123` wherever a skill writes `<ID>` — PR titles,
commit messages, the `Fixes <ID>` magic word. GitHub itself does not close
a Jira work item on merge; the key in `Fixes PROJ-123` is for the workflow
and, when installed, the Atlassian for GitHub app.

`issue.resolve-from-branch` parses every `letters-digits` fragment of the
branch name as a *candidate*, keeps those whose key equals `<PROJECT>`
(any letter case), and keeps the first one that actually resolves. Taking
the leftmost match alone is not safe: a branch named
`sprint-24-proj-456-fix` yields `SPRINT-24` before `PROJ-456`. If no
candidate resolves, stop and ask the user for the ID — never guess it.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `acli jira project list --limit 1` | exit 0 → installed and authenticated; a 401 or missing binary fails. Error → stop with "Run `acli jira auth login --site <SITE> --email <account-email> --token` (unscoped API token on stdin), or complete a human `acli` login, then `acli jira auth status`, and re-run." |
| `team.list` | — | the Jira project is the container; no team to pick |
| `team.check` | — | the Jira project is the container; no team to pick |
| `project.list` | `acli jira project list --limit 200 --json` | keys in `.[].key`, names in `.[].name`; match the repo name case-insensitive, or a typed key |
| `project.create` | — | creating a Jira project is admin work, not this adapter |
| `issue.read` | `acli jira workitem view <ID> --json --fields summary,description,status,issuetype,parent,comment,labels` | status, type, parent, labels, full description and comments in one JSON; labels only in JSON (`fields.labels`); missing ID → non-zero exit |
| `issue.read-relations` | the relations recipe below | parent, children, related work items and blockers |
| `issue.read-status` | the read recipe of the resolved strategy in `## Status strategies` | the issue's canonical phase; cheap enough to run every turn |
| `issue.read-branch` | `acli jira workitem view <ID> --json --fields summary,status`, then the branch-name recipe below | `<ID>`, `<title>` from summary, `<url>` per `## URL`, `<branchName>` |
| `issue.url` | the recipe in `## URL` | the issue link to print for the human |
| `issue.create-branch` | the create-branch recipe below | from the current checkout, which the caller has already put on `<base>`; stops when `<branchName>` exists locally or on `origin` |
| `issue.resolve-from-branch` | the loop below | prints `<ID>`, nothing when no candidate of `<PROJECT>` resolves |
| `issue.list-active` | the active-list recipe below | work items of `<PROJECT>` whose phase is `todo`, `in-progress` or `in-review` |
| `issue.list-open` | the open-list recipe below | every open work item of `<PROJECT>`, Backlog included, with its phase; a value the map does not hold is phase unknown and that item is dropped |
| `issue.create` | `acli jira workitem create --summary "<title>" --project "<PROJECT>" --type "<TYPE>" --description "$(cat body.md)" --json` | `<TYPE>` from `jira.issueType` or the type-discovery recipe; add `--label "<names>"` only when the user specified labels; take `.key` as `<ID>` (JSON also has `fields.status.name`); under `native` run `issue.set-status` with `backlog` afterwards unless the new item already reads as `backlog` |
| `issue.create-child` | `acli jira workitem create --summary "<title>" --project "<PROJECT>" --type "<TYPE>" --parent <PARENT-ID> --description "$(cat body.md)" --json` | `<PARENT-ID>` must resolve (`issue.read` first); same `<TYPE>` and backlog status rule as `issue.create`; create the parent first |
| `issue.add-blocked-by` | `acli jira workitem link create --out <OTHER-ID> --in <ID> --type Blocks --yes` | `<ID>` is blocked by `<OTHER-ID>` (`<OTHER-ID>` Blocks `<ID>`), shown on both; `<OTHER-ID>` must be a work item of `<PROJECT>` |
| `issue.update-description` | `acli jira workitem edit --key <ID> --description "$(cat body.md)" --yes` | replaces the whole description |
| `issue.set-status` | the write recipe of the resolved strategy in `## Status strategies` | writes a canonical phase; never `in-progress` on the agent's own initiative |
| `issue.comment` | `acli jira workitem comment create --key <ID> --body "$(cat body.md)"` | markdown/plain body, including a Session summary |
| `issue.relate` | `acli jira workitem link create --out <ID> --in <OTHER-ID> --type Relates --yes` | a Relates link, shown on both; if the type name is rejected, `acli jira workitem link type` lists the site's names |
| `status.list` | the status-list recipe below | unique workflow status **names** with `statusCategory.key` (`new`, `indeterminate`, `done`); `bind-statuses` maps the five phases to those names, or `comment` when five distinct names cannot be bound. Missing names are listed by `board-setup` |
| `label.list` | — | `label` is not a supported status strategy |
| `label.create` | — | `label` is not a supported status strategy |
| `board.rights` | — | `acli` does not expose `ADMINISTER_PROJECTS` or site admin; `native` is `unknown` and the skill asks; `label` is `no` because Jira does not support the label strategy |
| `status.create` | — | no API writes to Jira workflows (no stored token, no REST mutation); guided path: list the missing statuses, link the workflow editor, the user adds them, then `status.list` reads them back |

Guided path for `status.create` — only with the user's consent. `acli`
has no workflow-write command and this adapter stores no token, so there
is no REST mutation. List the names `status.list` does not yet return
that the five-phase map needs, print the project's workflow editor URL
(`https://<HOST>/jira/software/projects/<PROJECT>/settings/issuetypes`),
ask the user to add those statuses, then re-run `status.list`. HTTP 403
or "you cannot edit this workflow" → drop to `comment`.

Type-discovery recipe for `<TYPE>` — never assume an English type name.
When `jira.issueType` is a non-empty string, that is `<TYPE>`. Otherwise
list the project's allowed names, pick the ordinary work-item type (ask
when several look equally likely), and optionally record the choice as
`jira.issueType` in the platform config:

```bash
acli jira project view --key "<PROJECT>" --json \
  | jq -r '(.issueTypes // .fields.issueTypes // [])[] | .name'
```

```powershell
$view = acli jira project view --key "<PROJECT>" --json | ConvertFrom-Json
$types = @($view.issueTypes)
if (-not $types) { $types = @($view.fields.issueTypes) }
$types | ForEach-Object { $_.name }
```

When that list is empty, probe without creating: `--type` with a name the
project does not have fails before a work item is filed, and the error
contains `Please provide valid issue type. Allowed issue types for project are:`
followed by the localized names. Parse those names and pick as above.
A create that fails with that error is not a crash: take the list and retry
with a valid `--type`. Do not create an issue type (admin work).

Read-labels recipe — JSON only; text mode omits `labels` even when
`--fields` asks for them:

```bash
acli jira workitem view <ID> --json --fields labels \
  | jq -r '.fields.labels // .labels // [] | .[]'
```

```powershell
$issue = acli jira workitem view <ID> --json --fields labels | ConvertFrom-Json
@($issue.fields.labels)
```

Status-list recipe for `status.list` — names as the site spells them, plus
the category key (stable across locales: `new`, `indeterminate`, `done`).
An empty project yields no rows: ask the user for the workflow names, or
recommend `comment`.

```bash
acli jira workitem search --jql "project = <PROJECT>" --fields status --limit 200 --json \
  | jq -r '[.[] | {
      name: (.fields.status.name // .status.name // .status),
      category: (.fields.status.statusCategory.key // .status.statusCategory.key // "")
    }] | unique_by(.name) | .[] | "\(.category)\t\(.name)"'
```

```powershell
$items = acli jira workitem search --jql "project = <PROJECT>" --fields status --limit 200 --json | ConvertFrom-Json
@($items) | ForEach-Object {
  $status = $_.fields.status
  [pscustomobject]@{ category = $status.statusCategory.key; name = $status.name }
} | Sort-Object name -Unique
```

Map those rows to phases during `bind-statuses` (ask when a category has
more than one name, or when five distinct names cannot be filled):

- `new` → `backlog` and `todo`
- `indeterminate` → `in-progress` and `in-review`
- `done` → `done`

Relations recipe for `issue.read-relations` — each linked work item with its
role towards `<ID>` (`parent`, `child`, `related`, `blocked-by`, `blocks`);
run it again on the parent to reach the siblings:

```bash
acli jira workitem view <ID> --json --fields parent,subtasks,issuelinks \
  | jq --arg id "<ID>" '[
      ((.fields.parent // .parent) | select(. != null) | {role: "parent", key: (.key // .)}),
      ((.fields.subtasks // .subtasks // [])[] | {role: "child", key: (.key // .)}),
      ((.fields.issuelinks // .issuelinks // [])[] | (
        if .inwardIssue then
          {role: (if (.type.inward // "" | ascii_downcase) | test("block") then "blocked-by" else "related" end),
           key: .inwardIssue.key}
        elif .outwardIssue then
          {role: (if (.type.outward // "" | ascii_downcase) | test("block") then "blocks" else "related" end),
           key: .outwardIssue.key}
        else empty end
      ))
    ]'
```

Branch-name recipe for `issue.read-branch` — the ASCII name
`<id-lower>-<title slug>`, at most 50 slug characters; the same title always
yields the same name:

```bash
node -e 'const [n,t]=process.argv.slice(1);const s=t.normalize("NFKD").replace(/[̀-ͯ]/g,"").replace(/[łŁ]/g,"l").replace(/[đĐ]/g,"d").replace(/[øØ]/g,"o").toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,50).replace(/^-+|-+$/g,"");console.log(s?`${n}-${s}`:n)' "$(echo "<ID>" | tr "[:upper:]" "[:lower:]")" "<title>"
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
project=$(echo "<PROJECT>" | tr '[:lower:]' '[:upper:]')
for candidate in $(git branch --show-current | grep -oiE '[a-z]+-[0-9]+' | tr '[:lower:]' '[:upper:]'); do
  case "$candidate" in
    "$project"-*)
      acli jira workitem view "$candidate" --json >/dev/null 2>&1 && { echo "$candidate"; break; }
      ;;
  esac
done
```

```powershell
$project = '<PROJECT>'.ToUpperInvariant()
$branch = git branch --show-current
foreach ($match in [regex]::Matches($branch, '[A-Za-z]+-[0-9]+')) {
  $candidate = $match.Value.ToUpperInvariant()
  if ($candidate.StartsWith("$project-")) {
    acli jira workitem view $candidate --json 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) { $candidate; break }
  }
}
```

Active-list recipe for `issue.list-active`. Under `native`:

```bash
acli jira workitem search --jql "project = <PROJECT> AND status in (\"<map.todo>\", \"<map.in-progress>\", \"<map.in-review>\")" --fields key,summary,status --limit 200 --json \
  | jq '[.[] | {key: (.key // .), title: (.fields.summary // .summary), status: (.fields.status.name // .status.name // .status)}]'
```

Under `comment` the JQL is `project = <PROJECT> AND statusCategory != Done`,
then keep the issues whose phase (`issue.read-status`) is `todo`,
`in-progress` or `in-review`.

Open-list recipe for `issue.list-open` — the active-list recipe with the
`backlog` value added, in the order the search returns. Under `native` the
`status in` list reads `("<map.backlog>", "<map.todo>", "<map.in-progress>",
"<map.in-review>")`; a status the map does not hold is phase unknown and
never matches. Under `comment` the JQL is the active-list `comment` branch,
then keep the issues whose phase (`issue.read-status`) is `backlog`,
`todo`, `in-progress` or `in-review`.

## Children on close

The children are the work items whose role in `issue.read-relations` is
`child` (Cloud parent/subtasks); read each one's phase with
`issue.read-status`.

Jira Cloud does not close children when a parent is Done, by hand or when a
merged PR mentions `Fixes <ID>`, unless a project Automation rule does.
This adapter never relies on such a rule: the close-out reads the children
before the merge.

## URL

Build `https://<SITE>/browse/<ID>`. A view JSON has no browse URL of its
own.

## Statuses

Jira statuses are the project's own **localized names**, not status
categories and not English defaults — `fields.status.name` as `status.list`
returned it, which `bind-statuses` stores in the map. Spaces are fine
(`--status "<actual status name>"`). A wrong name, or a name with no
transition from the current status, fails loudly. Status categories
(`new` / `indeterminate` / `done`) are stable across locales and are how
`bind-statuses` proposes the map; they are not valid `--status` values.

Cloud simplified workflows do not hold five names: Scrum and team-managed
start as two or three names in the site's language; Kanban as four; none
include a review column by default. The YAML below is an **English-language
example** for a site that actually has those names. Do not copy it onto a
localized project. `bind-statuses` lists current names via `status.list`,
maps by `statusCategory.key`, and asks when a category is ambiguous. Adding
statuses to a board is `board-setup`: with admin rights it lists the
missing names and links the workflow editor; without them it switches to
`comment`. This adapter does not mutate the workflow. When the project
cannot bind five distinct names, `bind-statuses` records `strategy:
comment` instead.

Default strategy and map, used when the platform config has no `statuses`
block (semantics in `adapters/statuses.md`):

```yaml
strategy: native
map:
  backlog: Backlog
  todo: To Do
  in-progress: In Progress
  in-review: In Review
  done: Done
```

## Status strategies

Jira work items have no open/closed flag separate from their statuses, so
`label` is not supported. `<value>` is `map[<phase>]`; the value read back
is looked up in the map.

| Strategy | Read | Write |
|----------|------|-------|
| `native` | `acli jira workitem view <ID> --json --fields status` — the value is `fields.status.name` or `status.name`; exits non-zero for an ID that does not exist | `acli jira workitem transition --key <ID> --status '<value>' --yes` |
| `label` | — | — |
| `comment` | `acli jira workitem comment list --key <ID> --json` — sort by created time, take the newest body whose first line is `Status: <value>` | `acli jira workitem comment create --key <ID> --body "Status: <value>"` |

Under `comment` any author counts: on a typical Jira Software project only
members can comment. A project that lets outsiders comment should use
`native` instead — the outsider rule of `adapters/statuses.md`.

Comment-marker read (newest first). A comment body's first line is `body`
or `body.body` up to the first newline; none → `backlog`:

```bash
acli jira workitem comment list --key <ID> --json \
  | jq -r '(.comments // .) | if type == "array" then . else [.] end
      | sort_by(.created // .createdAt // .createdDate) | reverse[]
      | ((.body // .body.body // "") | if type == "string" then . else "" end)
      | split("\n")[0] | select(test("^Status: "))' | head -n 1
```

```powershell
$payload = acli jira workitem comment list --key <ID> --json | ConvertFrom-Json
$list = @($(if ($payload.comments) { $payload.comments } else { $payload }))
$marker = $list |
  Sort-Object { $_.created; $_.createdAt; $_.createdDate } -Descending |
  ForEach-Object {
    $body = $_.body
    if ($body -isnot [string]) { $body = $body.body }
    if ($body -isnot [string]) { return }
    $line = ($body -split "`n", 2)[0]
    if ($line -like 'Status: *') { $line }
  } |
  Select-Object -First 1
$marker
```

## Bugs

A bug is a work item of the project's bug-like type, discovered the same
way as `<TYPE>` (allowed names from `project view` or the create error
text). Prefer a name that is clearly the bug type in the project's
language; ask when several match. `issue.create` gets that name as
`--type`, not a hard-coded English `Bug`. When the project has no bug
type, the create fails loudly — stop and ask; do not create an issue type
(admin work) and do not fall back to a label.
