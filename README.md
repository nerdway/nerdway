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

### `nerd4rent:linear-issue-workflow`

A mandatory workflow for working a Linear issue by ID (e.g. `KAM-145`). It enforces a plan-before-code discipline:

1. Fetches the issue and reads every comment.
2. Drafts an implementation plan and posts it to Linear as a `## Implementation plan` comment.
3. Gates all repo changes until the plan is approved (`Status: approved`).
4. Applies a branch policy before the first commit.
5. Posts a `## Session summary` comment after every working session.

Pairs with the `linear-cli` skill for CLI syntax. Trigger: any Linear issue ID with intent to plan or implement (incl. Polish *zaplanuj*, *zrealizuj*, *napraw*).

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
