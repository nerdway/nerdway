# nerd4rent-claude-plugin

Open-source Claude Code skills that automate the daily developer workflow at [Nerd4Rent](https://nerd4rent.io).

## Skills

### `nerd4rent:new-project-workflow`

Bootstraps a new project end-to-end in a single approval:

1. Resolves the project directory (argument or `$PWD`).
2. Initializes git if absent.
3. Scaffolds `README.md` if absent.
4. Creates a GitHub repo with `gh` (public by default, confirm to flip).
5. Creates a matching Linear project via the `linear-cli` skill (team picked at runtime).
6. Lets you pick a spec-creating skill from the currently-available set (e.g. `/grill-me`, `/to-prd`, `/office-hours`).

Trigger phrases: *"new project workflow"*, *"bootstrap project"*, *"start a new project the nerd4rent way"*, or `/nerd4rent:new-project-workflow`.

### `nerd4rent:linear-issue-writer`

Creates a **new** Linear issue for the current repo with goals specified clearly enough that the planning agent can build an implementation plan straight from it. Upstream of `linear-issue-workflow`:

1. Resolves the target team/project (nerdbrain entity-page → git remote → ask), and confirms.
2. Adaptively interviews for missing goals — straight to a draft for small clear tasks, a short one-question-at-a-time interview for vague or multi-part work.
3. Drafts the issue from an adaptive template (full vs minimal) and gates the Linear write on your approval.
4. Decomposes the work: a checklist in the body by default, or **real Linear sub-issues** (parent + children via `--parent`) when the topic plainly splits into stages — and you can force or decline the split.
5. Prints the new issue ID/URL and offers to hand off to `linear-issue-workflow` to plan it.

Pairs with the `linear-cli` skill. Trigger: intent to create a new issue/task with no existing ID — *"utwórz/stwórz/dodaj/zgłoś issue"*, *"create issue"*, *"new task"*.

### `nerd4rent:linear-issue-workflow`

A mandatory workflow for working a Linear issue by ID (e.g. `KAM-145`). It enforces a plan-before-code discipline:

1. Fetches the issue and reads every comment.
2. Drafts an implementation plan and posts it to Linear as a `## Implementation plan` comment.
3. Gates all repo changes until the plan is approved (`Status: approved`).
4. Applies a branch policy before the first commit.
5. Posts a `## Session summary` comment after every working session.

Pairs with the `linear-cli` skill for CLI syntax. Trigger: any Linear issue ID with intent to plan or implement (incl. Polish *zaplanuj*, *zrealizuj*, *napraw*).

### `nerd4rent:nerdbrain-wiki`

The HOW for maintaining a personal Obsidian "second brain" — one entity page per project at `5-wiki/entities/projects/<slug>.md`. It carries:

- Section update modes (Edit/rewrite vs Append/chronological vs flag-staleness).
- The `obsidian` CLI command patterns and when to drop to filesystem writes.
- Index (`index.md`) and log (`log.md`) maintenance steps.
- A bundled `entity-page-template.md` to scaffold a brand-new page.

The *when to write* triggers and hard safety rules stay in the user's global `~/.claude/CLAUDE.md`; this skill is invoked once a write is warranted. Trigger: about to create or update a nerdbrain wiki entity page.

## Installation

Add this marketplace to Claude Code:

```bash
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
/plugin install nerd4rent@nerd4rent-claude-plugin
```

## Requirements

- `git`
- `gh` (GitHub CLI), authenticated (`gh auth status`)
- `linear-cli` skill installed and configured (or Linear MCP — the skill degrades gracefully if absent)

## License

MIT — see [LICENSE](LICENSE).
