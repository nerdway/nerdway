# Tracker adapter: Jira Cloud

Selected by `tracker: jira` in the platform config. Identifiers come from the
config's `jira` block: `<SITE>` = `jira.site` (hostname only, e.g.
`acme.atlassian.net`), `<PROJECT>` = `jira.project` (the project key, e.g.
`PROJ`). `<ID>` is a work item key (`PROJ-123`).

Jira Cloud only — Data Center / Server is out of scope. The Jira project is
the container, so `team.*` is `—`. Creating Jira projects is admin work, so
`project.create` is `—`. Jira Service Management, Assets and Advanced
Roadmaps are not used.

## CLI

`acli` is the official Atlassian CLI (Cloud-only). Never use `--web` (OAuth)
or `--editor`. Mutating commands that prompt take `--yes`. Parse JSON with
`--json` piped through `jq`; `acli` has no `--jq`.

- **Auth is API token, not OAuth.** `echo "$ATLASSIAN_API_TOKEN" | acli jira
  auth login --site "<SITE>" --email "<account-email>" --token` reads the
  token from stdin. `--web` is not the agent recipe. After login, commands
  use that site; `jira.site` must be the hostname that login used.
- `auth.check` is a real API call: `acli jira auth status` is not used,
  because an unauthenticated probe must fail.
- **`workitem view` takes a positional key**; every other work-item command
  takes `--key`. A missing key fails with a non-zero exit.
- Multi-line bodies go through `--description-file body.md` on create and
  edit. Comments have no file flag: `--body "$(cat body.md)"` preserves
  newlines, backticks, markdown and Polish diacritics. Descriptions are
  stored as plain text or ADF, not GitHub-flavoured markdown.
- `--json` on create prints the new work item; take `.key`. `--json` on view
  carries REST-shaped fields (`fields.status.name`, `fields.summary`, …) or
  a flattened `status.name` — recipes accept either.
- Default list size is 30 and further pages are dropped with no warning.
  Search and project lists pass `--limit 200` (or `--paginate`).
- `workitem transition --status "<name>"` needs a path in the project's
  workflow from the current status to that name; a missing path fails
  loudly. `--yes` skips the confirm prompt.
- JQL status names with spaces are quoted (`status = "In Progress"`).
- `--parent` on create sets the Cloud parent field (team-managed parent, or
  company-managed Epic/parent). It does not create a Sub-task type unless
  `--type` says so; this adapter creates `Task` children.
- On create, add `--label`, `--assignee` only when the user specified them —
  never invent metadata. `--type Bug` only for a bug (see `## Bugs`).
- Token: an Atlassian account API token from
  https://id.atlassian.com/manage-profile/security/api-tokens, scoped to
  Jira. Never commit it, never put it in the platform config.

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
| `auth.check` | `acli jira project list --limit 1` | exit 0 → installed and authenticated; a 401 or missing binary fails. Error → stop with "Run `acli jira auth login --site <SITE> --email <account-email> --token` (API token on stdin), and re-run." |
| `team.list` | — | the Jira project is the container; no team to pick |
| `team.check` | — | the Jira project is the container; no team to pick |
| `project.list` | `acli jira project list --limit 200 --json` | keys in `.[].key`, names in `.[].name`; match the repo name case-insensitive, or a typed key |
| `project.create` | — | creating a Jira project is admin work, not this adapter |
| `issue.read` | `acli jira workitem view <ID> --json --fields summary,description,status,issuetype,parent,comment` | status, type, parent, full description and comments in one JSON; missing ID → non-zero exit |
| `issue.read-relations` | the relations recipe below | parent, children, related work items and blockers |
| `issue.read-status` | the read recipe of the resolved strategy in `## Status strategies` | the issue's canonical phase; cheap enough to run every turn |
| `issue.read-branch` | `acli jira workitem view <ID> --json --fields summary,status`, then the branch-name recipe below | `<ID>`, `<title>` from summary, `<url>` per `## URL`, `<branchName>` |
| `issue.url` | the recipe in `## URL` | the issue link to print for the human |
| `issue.create-branch` | the create-branch recipe below | from the current checkout, which the caller has already put on `<base>`; stops when `<branchName>` exists locally or on `origin` |
| `issue.resolve-from-branch` | the loop below | prints `<ID>`, nothing when no candidate of `<PROJECT>` resolves |
| `issue.list-active` | the active-list recipe below | work items of `<PROJECT>` whose phase is `todo`, `in-progress` or `in-review` |
| `issue.list-open` | the open-list recipe below | every open work item of `<PROJECT>`, Backlog included, with its phase; a value the map does not hold is phase unknown and that item is dropped |
| `issue.create` | `acli jira workitem create --summary "<title>" --project "<PROJECT>" --type Task --description-file body.md --json` | take `.key` as `<ID>`; under `native` run `issue.set-status` with `backlog` afterwards unless the new item already reads as `backlog` |
| `issue.create-child` | `acli jira workitem create --summary "<title>" --project "<PROJECT>" --type Task --parent <PARENT-ID> --description-file body.md --json` | `<PARENT-ID>` must resolve (`issue.read` first); same backlog status rule as `issue.create`; create the parent first |
| `issue.add-blocked-by` | `acli jira workitem link create --out <OTHER-ID> --in <ID> --type Blocks --yes` | `<ID>` is blocked by `<OTHER-ID>` (`<OTHER-ID>` Blocks `<ID>`), shown on both; `<OTHER-ID>` must be a work item of `<PROJECT>` |
| `issue.update-description` | `acli jira workitem edit --key <ID> --description-file body.md --yes` | replaces the whole description |
| `issue.set-status` | the write recipe of the resolved strategy in `## Status strategies` | writes a canonical phase; never `in-progress` on the agent's own initiative |
| `issue.comment` | `acli jira workitem comment create --key <ID> --body "$(cat body.md)"` | markdown/plain body, including a Session summary |
| `issue.relate` | `acli jira workitem link create --out <ID> --in <OTHER-ID> --type Relates --yes` | a Relates link, shown on both; if the type name is rejected, `acli jira workitem link type` lists the site's names |
| `status.list` | — | `acli` has no status-listing command; a wrong `--status` fails loudly on write. `bind-statuses` proposes the adapter default map, or `comment` when the workflow cannot name five phases |
| `label.list` | — | `label` is not a supported status strategy |
| `label.create` | — | `label` is not a supported status strategy |

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

Jira statuses are the project's own **names**, not status categories —
`To Do`, not `todo`; `In Progress`, not `indeterminate`. Spaces are fine
(`--status "In Progress"`). A wrong name, or a name with no transition from
the current status, fails loudly.

Cloud simplified workflows do not hold five names: Scrum and team-managed
start as To Do / In Progress / Done; Kanban as Backlog / Selected for
Development / In Progress / Done. None include **In Review**. The default
below is the recommended native map **when the project can bind those
names** (an admin adds the missing statuses). Adding statuses to a board is
a separate skill; this adapter does not mutate the workflow. When the
project cannot bind five distinct names, `bind-statuses` records
`strategy: comment` instead.

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

## Bugs

A bug is a work item of type `Bug`. `issue.create` gets `--type Bug` instead
of `Task`. When the project has no Bug type, the create fails loudly — stop
and ask; do not create an issue type (admin work) and do not fall back to a
label.
