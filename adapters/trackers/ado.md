# Tracker adapter: Azure DevOps Boards

Selected by `tracker: ado` in the platform config. Identifiers come from the
config's `ado` block:

- `<ORG>` — `https://dev.azure.com/<ado.org>`.
- `<PROJECT>` — `ado.project`, the project holding both the work items and
  the repo.
- `<TEAM>` — `ado.team`, the team whose board carries the phases (e.g.
  `Sandbox Team`).
- `<BOARD>` — `ado.board`, that team's board, named after its backlog level
  (`Stories` on Agile, `Backlog items` on Scrum, `Issues` on Basic).
- `<TYPE>` — `ado.workItemType`, the work item type issues are created as
  (e.g. `User Story`).
- `<n>` — the work item ID without `#`.

`bind-statuses` writes `team`, `board` and `workItemType`. The project is the
container, so `project.*` is `—`. Iterations, swimlanes and backlog levels
above `<TYPE>` are not used.

## CLI

`az` is the Azure CLI; every command below needs its `azure-devops`
extension. Pass `--organization <ORG>` on every command and `--project
<PROJECT>` wherever the command takes it, so the result never depends on
`az devops configure` defaults or the checkout. Never use `--bypass-rules`.

- **Work item IDs are unique across the whole organisation**, not per project.
  `az boards work-item show --id <n>` returns an item of any project the user
  can read, so every read that starts from a typed ID checks
  `fields["System.TeamProject"]` equals `<PROJECT>`; another project → stop
  and report the project it belongs to. A missing ID fails with `TF401232:
  Work item <n> does not exist`, exit 1.
- `az boards work-item show --fields` must be paired with `--expand none`;
  without it the extension fails with `The expand parameter can not be used
  with the fields parameter`. `az boards` output carries no `_links`.
- `az boards work-item create --description` stores the description as HTML,
  so markdown shows up raw. Work items are created through `az devops invoke
  --area wit --resource workItems` (a JSON Patch with
  `/multilineFieldsFormat/System.Description` = `Markdown`), whose response
  carries `_links.html.href`. Once a field is Markdown it stays Markdown.
- `az devops invoke --resource workItems` only reaches the **create** route
  (`{project}/_apis/wit/workItems/${type}`); updates that need a JSON Patch
  `replace` go through `--area wit --resource batch` (`_apis/wit/$batch`),
  one request per item.
- `az boards work-item update --fields "System.Tags=<tags>"` **adds** tags and
  never removes one, so tag removal is a `replace` through the batch route.
  ADO creates a project tag the first time a work item carries it; the tags
  API (`--resource tags`) lists, renames and deletes, but has no create.
- The board column lives in a per-board field
  `WEF_<guid>_Kanban.Column`, named by `fields.columnField.referenceName` of
  the board (`--area work --resource boards`). `System.BoardColumn` is
  read-only and, when the item shows on several teams' boards, reflects
  whichever board moved it last — never read the phase from it.
- **A column write that disagrees with `System.State` is silently dropped**:
  `az boards work-item update` exits 0 and ADO moves the item to the first
  column mapped to its state; the same happens for a column name the board
  does not have. Every column write therefore sets the column and the state
  the column maps (`columns[].stateMappings[<type>]`) together and reads the
  column back.
- Columns are changed with a `PUT` of the board's whole column list
  (`--area work --resource columns`), which needs team admin rights. A
  middle (`inProgress`) column may map to the `Proposed` state, so `Todo`
  can sit between `New` and `Active` on the stock Agile process.
- A team created after the project has no board until its backlog iteration
  is set; `work/boards` then fails with HTTP 500.
- Comments exist only on the preview API: `az devops invoke --area wit
  --resource comments --api-version 7.1-preview`. `POST` with
  `--query-parameters format=markdown` stores markdown; without it the
  comment is HTML. Each comment carries `id`, `format` (`markdown` or `html`),
  `text`, `createdDate` and `createdBy.uniqueName`. `GET` pages at most 200
  comments (`$top=200`); a `continuationToken` in the response names the
  next page. ADO also posts its own comments (e.g. `Completing Pull Request
  3 and updating the associated work items.`).
- A PR whose description contains `Fixes #<n>` moves `<n>` to its
  `Completed` state (and so the `Closed` column) when the PR completes; a PR
  merely linked with `--work-items` does not.
- Parent links: an item has at most one `Parent`
  (`System.LinkTypes.Hierarchy-Reverse`); a second one fails with
  `TF201036`. Creating a child whose parent does not exist fails with
  `TF401232` and creates nothing.
- Auth: `az login` or `az devops login` with a PAT holding **Work Items
  (Read, write & manage)**, **Code (Read & write)** and **Project and Team
  (Read)**; team admin rights are needed only to add board columns.

## Issue ID

Recognised only when the platform config says `tracker: ado` — elsewhere
`#123` is just a number in prose.

- `#123` — work item 123.
- `AB#123` and a bare `123` are accepted as input and mean the same item.
- `!123` is never a work item.

The ID is written `#123` wherever a skill writes `<ID>` — PR titles, commit
messages, the `Fixes <ID>` magic word. ADO links a commit whose message
mentions `#123` to the work item.

`issue.resolve-from-branch` reads the leading number of the branch name
(`123-some-title`), the shape `issue.read-branch` produces, and keeps it only
when it resolves to a work item of `<PROJECT>`. A branch with no leading
number resolves to nothing: stop and ask the user for the ID — never guess
it.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `az devops project list --organization <ORG> --top 1 -o none` | a real API call: passes for both `az login` and a PAT, fails without the extension. Error → stop with "Run `az extension add --name azure-devops`, then `az login` (or `az devops login` with a PAT), and re-run." |
| `team.list` | `az devops team list --organization <ORG> --project <PROJECT> --query "[].name" -o json` | team names for `bind-statuses` to pick from |
| `team.check` | `az devops team show --organization <ORG> --project <PROJECT> --team "<TEAM>" -o none` | exit 0 → the team exists |
| `project.list` | — | the project is the container, taken from the `ado` block |
| `project.create` | — | the project is the container, taken from the `ado` block |
| `issue.read` | `az boards work-item show --organization <ORG> --id <n> --expand all -o json` (project check in `## CLI`), then the comments recipe below | state, tags, relations, full description (`System.Description`, markdown or HTML per `multilineFieldsFormat`), then every comment |
| `issue.read-relations` | the relations recipe below | parent, children and related work items |
| `issue.read-status` | the read recipe of the resolved strategy in `## Status strategies` | the issue's canonical phase |
| `issue.read-branch` | `az boards work-item show --organization <ORG> --id <n> --expand none --fields System.Title,System.TeamProject -o json` (project check), then the branch-name recipe below | `<ID>` = `#<n>`, `<title>` = `System.Title`, `<url>` per `## URL`, `<branchName>` |
| `issue.create-branch` | the create-branch recipe below | from the current checkout, which the caller has already put on `<base>`; stops when `<branchName>` exists locally or on `origin` |
| `issue.resolve-from-branch` | the loop below | prints `#<n>`, nothing when the branch carries no work item of `<PROJECT>` |
| `issue.list-active` | the active-list recipe below | work items of `<PROJECT>` whose phase is `todo`, `in-progress` or `in-review` |
| `issue.create` | the create recipe below | a `<TYPE>` work item with a markdown description on `<TEAM>`'s area; under `native` run `issue.set-status` with `backlog` afterwards unless the new item already reads as `backlog` |
| `issue.create-child` | the create recipe below with the parent link | `<PARENT-n>` must be a work item of `<PROJECT>` (read it first); create the parent first |
| `issue.update-description` | the update-description recipe below | replaces the whole description and keeps it markdown |
| `issue.set-status` | the write recipe of the resolved strategy in `## Status strategies` | writes a canonical phase; never `in-progress` on the agent's own initiative |
| `issue.comment` | the comment recipe below | markdown body |
| `status.list` | the board recipe below — `columns[].name` | under `native` the phases are the columns of `<BOARD>`, not work item states |
| `label.list` | `az devops invoke --organization <ORG> --area wit --resource tags --route-parameters project=<PROJECT> --api-version 7.1-preview -o json` | the tags already used in the project; names in `.value[].name` |
| `label.create` | — | ADO has no tag create: a tag appears the first time a work item carries it. `bind-statuses` asks for consent to the tags as it would for labels, and the first `issue.set-status` of that phase creates the tag |

Board recipe — the column field, the columns and their state per work item
type; every `native` recipe starts from it:

```bash
az devops invoke --organization <ORG> --area work --resource boards \
  --route-parameters project=<PROJECT> team="<TEAM>" id="<BOARD>" --api-version 7.1 -o json \
  | jq '{field: .fields.columnField.referenceName, columns: [.columns[] | {id, name, columnType, stateMappings}]}'
```

`team.list` lists the teams; a team's boards are
`az devops invoke --organization <ORG> --area work --resource boards --route-parameters project=<PROJECT> team="<TEAM>" --api-version 7.1 -o json | jq '[.value[].name]'`,
and `<TYPE>` is a key of the columns' `stateMappings`.

Add-columns recipe for `bind-statuses` — only with the user's consent. Read
the whole list, insert the new columns, `PUT` it back; a new column needs a
`stateMappings` entry for **every** type the board carries:

```bash
az devops invoke --organization <ORG> --area work --resource columns \
  --route-parameters project=<PROJECT> team="<TEAM>" board="<BOARD>" --api-version 7.1 -o json > columns.json
jq --argjson at 1 --arg name "Todo" --arg state "New" --arg type "<TYPE>" \
  '.value | .[:$at] + [{name: $name, columnType: "inProgress", itemLimit: 0, stateMappings: {($type): $state}}] + .[$at:]' \
  columns.json > new-columns.json
az devops invoke --organization <ORG> --area work --resource columns \
  --route-parameters project=<PROJECT> team="<TEAM>" board="<BOARD>" \
  --http-method PUT --in-file new-columns.json --api-version 7.1 -o json | jq '[.value[].name]'
```

HTTP 403 → the user is not a team admin: stop and offer `label` instead.

Comments recipe for `issue.read` — every comment, newest first:

```bash
tok=""
while :; do
  page=$(az devops invoke --organization <ORG> --area wit --resource comments \
    --route-parameters project=<PROJECT> workItemId=<n> \
    --query-parameters order=desc '$top=200' ${tok:+"continuationToken=$tok"} \
    --api-version 7.1-preview -o json) || exit 1
  echo "$page" | jq -c '.comments[] | {id, createdDate, author: .createdBy.uniqueName, format, text}'
  tok=$(echo "$page" | jq -r '.continuationToken // empty')
  [ -z "$tok" ] && break
done
```

Relations recipe for `issue.read-relations` — each linked work item with its
role towards `<n>` (`parent`, `child`, `related`); run it again on the parent
to reach the siblings, and `issue.read-branch`'s `show` on an ID for its
title:

```bash
az boards work-item show --organization <ORG> --id <n> --expand relations -o json \
  | jq '[.relations[]? | select(.rel | test("^System\\.LinkTypes\\.(Hierarchy-Reverse|Hierarchy-Forward|Related)$"))
      | {role: ({"System.LinkTypes.Hierarchy-Reverse": "parent", "System.LinkTypes.Hierarchy-Forward": "child", "System.LinkTypes.Related": "related"}[.rel]),
         id: (.url | split("/") | last | tonumber)}]'
```

Pull request and commit links (`ArtifactLink`) are left out.

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
[ -n "$n" ] && az boards work-item show --organization <ORG> --id "$n" --expand none --fields System.TeamProject -o json 2>/dev/null \
  | jq -e '.fields["System.TeamProject"] == "<PROJECT>"' >/dev/null && echo "#$n"
```

Active-list recipe for `issue.list-active`. Under `native`, with `<FIELD>`
the board recipe's `field`:

```bash
az boards query --organization <ORG> --project <PROJECT> -o json \
  --wiql "SELECT [System.Id], [System.Title], [<FIELD>] FROM WorkItems WHERE [System.TeamProject] = '<PROJECT>' AND [<FIELD>] IN ('<map.todo>', '<map.in-progress>', '<map.in-review>')" \
  | jq '[.[] | {id, title: .fields["System.Title"], column: .fields["<FIELD>"]}]'
```

Under `label` the `WHERE` reads `[System.TeamProject] = '<PROJECT>' AND
([System.Tags] CONTAINS '<map.todo>' OR [System.Tags] CONTAINS
'<map.in-progress>' OR [System.Tags] CONTAINS '<map.in-review>')`, then keep
the items whose phase (`issue.read-status`) is one of the three. Under
`comment` it reads `[System.TeamProject] = '<PROJECT>' AND
[System.WorkItemType] = '<TYPE>'`, with the same phase filter.

Create recipe for `issue.create` and `issue.create-child`. `<TEAM>`'s
default area puts the item on its board; with no `ado.team` drop the
`AreaPath` entry and the item lands on the project's root area:

```bash
area=$(az boards area team list --organization <ORG> --project <PROJECT> --team "<TEAM>" --query defaultValue -o tsv)
jq -n --arg title "<title>" --rawfile body body.md --arg area "$area" '[
  {op: "add", path: "/fields/System.Title", value: $title},
  {op: "add", path: "/fields/System.AreaPath", value: $area},
  {op: "add", path: "/fields/System.Description", value: $body},
  {op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown"}
]' > patch.json
az devops invoke --organization <ORG> --area wit --resource workItems \
  --route-parameters project=<PROJECT> type="<TYPE>" --http-method POST \
  --in-file patch.json --media-type application/json-patch+json --api-version 7.1 -o json \
  | jq '{id, url: ._links.html.href}'
```

`<ID>` = `#` + `id`. For `issue.create-child` append the parent link to the
patch before the `POST`:

```bash
jq --arg parent "<ORG>/_apis/wit/workItems/<PARENT-n>" \
  '. + [{op: "add", path: "/relations/-", value: {rel: "System.LinkTypes.Hierarchy-Reverse", url: $parent}}]' \
  patch.json > child.json
```

and post `child.json`. The child is the same `<TYPE>` as the parent, so both
stay on `<BOARD>`.

Update-description recipe for `issue.update-description`:

```bash
jq -n --rawfile body body.md '[{method: "PATCH", uri: "/_apis/wit/workItems/<n>?api-version=7.1",
  headers: {"Content-Type": "application/json-patch+json"},
  body: [{op: "add", path: "/fields/System.Description", value: $body},
         {op: "add", path: "/multilineFieldsFormat/System.Description", value: "Markdown"}]}]' > batch.json
az devops invoke --organization <ORG> --area wit --resource batch --http-method POST \
  --in-file batch.json --api-version 7.1 -o json | jq '.value[0].code'
```

A non-zero exit or a code other than `200` → stop and report the body.

Comment recipe for `issue.comment`:

```bash
jq -n --rawfile text body.md '{text: $text}' > comment.json
az devops invoke --organization <ORG> --area wit --resource comments \
  --route-parameters project=<PROJECT> workItemId=<n> --query-parameters format=markdown \
  --http-method POST --in-file comment.json --api-version 7.1-preview -o json | jq '{id, createdDate}'
```

## URL

Take the link from `_links.html.href` when a create returned it. Otherwise
build `https://dev.azure.com/<ado.org>/<PROJECT>/_workitems/edit/<n>`, with
spaces in `<PROJECT>` written `%20`.

## Statuses

The stock processes have too few distinct states for five phases (Agile:
New / Active / Resolved / Closed, Scrum: New / Approved / Committed / Done,
Basic: To Do / Doing / Done), and a map may not name a value twice. On Azure
DevOps `native` therefore binds the phases to the **columns of the team's
board**, which a team admin can add without touching the process; each
column maps to a state, so the state follows the column. `bind-statuses`
adds the missing columns with the user's consent.

Default strategy and map, used when the platform config has no `statuses`
block (semantics in `adapters/statuses.md`) — the stock Agile board with
`Todo` and `In Review` added and `Resolved` renamed:

```yaml
strategy: native
map:
  backlog: New
  todo: Todo
  in-progress: Active
  in-review: In Review
  done: Closed
```

## Status strategies

`<value>` is `map[<phase>]`; the value read back is looked up in the map,
following the rules of `adapters/statuses.md`. The recipes are spelled out
below the table.

| Strategy | Read | Write |
|----------|------|-------|
| `native` | the column read below | the column write below |
| `label` | the tag read below | the tag write below |
| `comment` | the comments recipe of `issue.read`, then the marker read below | the comment recipe of `issue.comment` with the body `Status: <value>` |

Column read — the value is `<n>`'s column on `<BOARD>`; empty means the item
is not on that board: phase unknown, report it.

```bash
field=$(<board recipe> | jq -r .field)
az boards work-item show --organization <ORG> --id <n> --expand none --fields "$field",System.TeamProject -o json \
  | jq -r --arg f "$field" '.fields[$f] // ""'
```

Column write — the column and the state it maps set together, then read
back:

```bash
board=$(<board recipe>)
field=$(echo "$board" | jq -r .field)
type=$(az boards work-item show --organization <ORG> --id <n> --expand none --fields System.WorkItemType -o json | jq -r '.fields["System.WorkItemType"]')
state=$(echo "$board" | jq -r --arg c "<value>" --arg t "$type" '.columns[] | select(.name == $c) | .stateMappings[$t] // empty')
[ -n "$state" ] || { echo "column <value> has no state for $type on <BOARD> — run /bind-statuses" >&2; exit 1; }
az boards work-item update --organization <ORG> --id <n> --fields "$field=<value>" "System.State=$state" -o none
```

Then run the column read: a value other than `<value>` → stop and report
"ADO kept `<n>` in column `<read value>`" — a process rule refused the move.
Never retry with `--bypass-rules`.

Tag read — `closed` when the state's category is `Completed`, otherwise the
mapped tags the item carries, none → `open`:

```bash
az boards work-item show --organization <ORG> --id <n> --expand none --fields System.State,System.Tags,System.WorkItemType -o json > item.json
az devops invoke --organization <ORG> --area wit --resource workItemTypeStates \
  --route-parameters project=<PROJECT> type="$(jq -r '.fields["System.WorkItemType"]' item.json)" --api-version 7.1 -o json > states.json
jq -r --slurpfile s states.json '(.fields["System.State"]) as $state
  | ($s[0].value[] | select(.name == $state) | .category) as $cat
  | if $cat == "Completed" then "closed"
    elif $cat == "Removed" then $state
    else ((.fields["System.Tags"] // "") | split("; ") | map(select(. != ""))) end' item.json
```

The tag list is then matched against the map: one mapped tag → its phase,
none → `open`, two or more → the conflict of `adapters/statuses.md`. A
`Removed` item prints its state name, which no map holds.

Tag write — with the tag read's `item.json` and `states.json` at hand:

- `closed` → `az boards work-item update --organization <ORG> --id <n> --fields "System.State=$(jq -r '[.value[] | select(.category == "Completed") | .name][0]' states.json)" -o none`;
  leave the tags.
- `open` or a tag → one batch `replace` of `System.Tags` with the item's tags
  minus every other mapped tag, plus `<value>` unless it is `open`; `reopen`
  is the first `Proposed` state when the read found `closed`, else empty:

```bash
reopen=$(jq -r 'if "<read value>" == "closed" then [.value[] | select(.category == "Proposed") | .name][0] else "" end' states.json)
jq -n --arg tags "<new tag list joined with '; '>" --arg reopen "$reopen" '[{method: "PATCH", uri: "/_apis/wit/workItems/<n>?api-version=7.1",
  headers: {"Content-Type": "application/json-patch+json"},
  body: ([{op: "replace", path: "/fields/System.Tags", value: $tags}]
         + (if $reopen == "" then [] else [{op: "add", path: "/fields/System.State", value: $reopen}] end))}]' > batch.json
az devops invoke --organization <ORG> --area wit --resource batch --http-method POST \
  --in-file batch.json --api-version 7.1 -o json | jq '.value[0].code'
```

The tag need not exist beforehand — the write creates it — so the value is
checked against the map, never against `label.list`.

Marker read — walk the comments newest first; a comment's first line is its
`text` up to the first newline when `format` is `markdown`, and for `html`
the text with `<br>`, `</div>` and `</p>` turned into newlines, other tags
dropped and `&nbsp;` read as a space. The first comment whose first line is
`Status: <value>` gives the value; none → `backlog`.

```bash
jq -r '(if .format == "html" then (.text | gsub("<br\\s*/?>|</(div|p)>"; "\n") | gsub("<[^>]+>"; "") | gsub("&nbsp;"; " ")) else .text end
  | split("\n")[0]) as $first | select($first | test("^Status: ")) | $first' | head -n 1
```

Any author counts: on Azure DevOps only members of the project — Stakeholder
access included — can comment on a work item, even in a public project, so
the outsider rule of `adapters/statuses.md` does not apply.
