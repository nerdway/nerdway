# Tracker adapter: Linear

Selected by `tracker: linear` in the platform config. Identifiers come from
the config's `linear` block: `<KEY>` = `linear.team`, `<PROJECT>` =
`linear.project` (UUID; the project name is accepted too).

## CLI

`linearis` is the Linear CLI (npm, pure JS, JSON-only output, never
interactive).

- `--fields` takes comma-separated dot-paths and trims the JSON to exactly
  those keys. On `list` commands the result is `{nodes: [...]}`, so paths need
  the `nodes.` prefix — `--fields identifier` on a list returns `{}` with no
  error.
- `--with-comments` inlines every comment (`comments.nodes[].body`, markdown)
  into the issue JSON; linked PRs show up as comments from the GitHub sync.
  Inline images stay markdown URLs inside `description`/`body` — fetch one
  only when it matters.
- Multi-line bodies go through the flag, not stdin: `--body "$(cat body.md)"`
  and `--description "$(cat body.md)"` preserve newlines, backticks, markdown
  and Polish diacritics as-is. There is no `-` stdin sentinel, no
  `--body-file`, no `--description-file`.
- `projects list` has no `--team` filter; each returned project carries its
  owning teams, so filter on `teams.nodes[].key` client-side.
- `--status` on `issues list` requires `--team`.
- `linearis auth status` exits 0 even unauthenticated, so `auth.check` is a
  real API call.
- On create, add `--labels`, `--priority`, `--estimate` only when the user
  specified them — never invent metadata. Priority is **numeric** (`1`=urgent,
  `2`=high, `3`=medium, `4`=low); `--estimate` fails loudly on teams with
  estimates disabled.

## Issue ID

`TEAM-123` — team key, dash, number. `linearis` resolves `DEMO-123` but not
`demo-123`, so upper-case every candidate.

Linear's `branchName` is lowercase and there is no command mapping a branch
back to an issue, so `issue.resolve-from-branch` parses every
`letters-digits` fragment of the branch name as a *candidate* and keeps the
first one that actually resolves. Taking the leftmost match alone is not safe:
a branch named `sprint-24-demo-456-fix` yields `SPRINT-24` before `DEMO-456`,
and that wrong-but-plausible ID would flow into a status write and close
somebody else's issue. Resolving each candidate also keeps older branches
working — a `pawel/demo-123-tytul` branch still lands on `DEMO-123`. If no
candidate resolves, stop and ask the user for the ID — never guess it.

## Operations

| Operation | Command | Notes |
|-----------|---------|-------|
| `auth.check` | `linearis teams list --limit 1` | exit 0 → installed and authenticated |
| `team.list` | `linearis teams list` | team keys for the user to pick from |
| `team.check` | `linearis issues list --team <KEY> --limit 1` | sanity-check that a team key exists |
| `project.list` | `linearis projects list --fields nodes.id,nodes.name,nodes.url,nodes.teams.nodes.key` | match `name` **and** the team key in `teams.nodes[].key` client-side; `id` is the project UUID |
| `project.create` | `linearis projects create "<name>" --team <KEY> --description "<one-line description>" --fields id,name,url` | take `.id` (UUID) and `.url` straight from the output |
| `issue.read` | `linearis issues read <ID> --with-comments` | state, full description and every comment in one JSON |
| `issue.read-status` | `linearis issues read <ID> --fields identifier,title,state.name` | cheap enough to run every turn; exits non-zero for an ID that does not exist |
| `issue.read-branch` | `linearis issues read <ID> --fields identifier,title,branchName,state.name,url` | `branchName` is already safe for git |
| `issue.resolve-from-branch` | the loop below | prints the first candidate that resolves, nothing when none does |
| `issue.list-active` | `linearis issues list --team <KEY> --project <PROJECT> --status 'Todo,In Progress,In Review' --fields nodes.identifier,nodes.title,nodes.state.name` | the project's active board |
| `issue.create` | `linearis issues create "<title>" --team <KEY> --project "<PROJECT>" --status Backlog --description "$(cat body.md)"` | pass the state explicitly so the team default cannot override it; the JSON carries `.identifier`, no URL |
| `issue.create-child` | `linearis issues create "<title>" --team <KEY> --project "<PROJECT>" --parent-ticket <PARENT-ID> --status Backlog --description "$(cat body.md)"` | create the parent first and read its `.identifier` |
| `issue.update-description` | `linearis issues update <ID> --description "$(cat body.md)"` | replaces the whole description |
| `issue.set-status` | `linearis issues update <ID> --status '<state name>'` | state names from `## Statuses` |
| `issue.comment` | `linearis issues discuss <ID> --body "$(cat body.md)"` | markdown body |

`issue.resolve-from-branch`:

```bash
for candidate in $(git branch --show-current | grep -oiE '[a-z]+-[0-9]+' | tr '[:lower:]' '[:upper:]'); do
  linearis issues read "$candidate" --fields identifier >/dev/null 2>&1 && { echo "$candidate"; break; }
done
```

## URL

Take the link from the issue JSON's `url` field (request it with
`--fields … ,url`). When a `linearis` release returns no `url`, build it as
`https://linear.app/<workspace>/issue/<ID>`, with the workspace slug taken
from the project's `url` (`project.list`).

## Statuses

States are the team's own **names**, not state types — `Backlog`, not
`backlog`; `In Progress`, not `started`. Spaces are fine
(`--status 'In Progress'`). There is no state-listing command: a wrong name
fails loudly with `Status "X" for team ... not found`, naming nothing else —
fix the name and retry.

| Workflow phase | State name |
|----------------|------------|
| New issue | `Backlog` |
| Planned | `Todo` |
| Implementation (set by the human) | `In Progress` |
| Code review | `In Review` |
| Closed | `Done` |
