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
5. Creates the issue **in Backlog** (explicit `-s backlog`), then offers an optional grilling session (`grill-with-docs`, if available in the session) that can sharpen the description or split the topic into sub-issues.
6. Prints the new issue ID/URL and hands off to the status-driven flow: type the issue ID in a new session/message to start planning with `linear-issue-workflow`.

Pairs with the `linear-cli` skill. Trigger: intent to create a new issue/task with no existing ID — *"utwórz/stwórz/dodaj/zgłoś issue"*, *"create issue"*, *"new task"*.

### `nerd4rent:linear-issue-workflow`

A mandatory **status-driven** workflow for working a Linear issue by ID (e.g. `KAM-145`). The issue's Linear status is the single source of truth — you steer by changing the status, the agent never asks you to "confirm the plan" in chat:

1. Fetches the issue (`linear issue view -j`) at the start of every turn and dispatches on status — also when a bare issue ID is typed into a fresh session.
2. **Backlog/Todo** → drafts an implementation plan, posts it as a `## Implementation plan` comment, sets the status to Todo, and ends the turn with no instructions.
3. **In Progress** (set manually by you = plan approved) → starts implementation: branch from the Linear `branchName`, empty commit, push, **draft PR with magic words** (`Fixes TEAM-123`) so the Linear↔GitHub integration closes the issue on merge; then offers an implementation mode (superpowers / Matt Pocock skills / plain agent — whichever is available).
4. After implementation or on **In Review** → offers a code-review menu (superpowers / Matt Pocock / review it yourself); never offers to merge or close on its own.
5. Close-out on request: delegates to **`nerd4rent:linear-issue-close`** (below) to merge and finish the issue.
6. Posts a `## Session summary` comment after every working session.

Pairs with the `linear-cli` skill for CLI syntax. Trigger: any Linear issue ID with intent to plan or implement (incl. Polish *zaplanuj*, *zrealizuj*, *napraw*).

### `nerd4rent:linear-issue-close`

A deliberately **mechanical, lightweight** close-out for a finished issue — purely procedural with explicit commands and no multi-step reasoning, so it's cheap enough to run on a fast model (Haiku). Invoked by `linear-issue-workflow`'s close-out phase, or directly:

1. Commits any leftover changes (repo convention: Polish, noun-form message, no co-author) — or skips if the tree is clean.
2. Pushes the branch (sets upstream if needed).
3. Detects GitHub vs GitLab from the origin remote and merges the PR/MR with the repo's default method (`gh pr merge` / `glab mr merge`; marks a draft PR ready first).
4. Switches the local checkout to the PR/MR's **base** branch (read from the PR/MR, not assumed to be `main`) and pulls.
5. Sets the Linear issue to **Done** (`linear issue update <ID> -s Done`) — deterministic and covering GitLab, where there's no Linear↔GitHub auto-close.

On any error (e.g. merge conflict, missing `gh`/`glab`) it stops and reports rather than improvising. Pairs with the `linear-cli` skill. Trigger: intent to close/merge/finish an issue — *"domknij"*, *"zamknij"*, *"zmerguj i zamknij"*, *"close out"*, *"merge and close"*.

### `nerd4rent:nerdbrain-wiki`

The HOW for maintaining a personal Obsidian "second brain" — one entity page per project at `5-wiki/entities/projects/<slug>.md`. It carries:

- Section update modes (Edit/rewrite vs Append/chronological vs flag-staleness).
- The `obsidian` CLI command patterns and when to drop to filesystem writes.
- Index (`index.md`) and log (`log.md`) maintenance steps.
- A bundled `entity-page-template.md` to scaffold a brand-new page.

The *when to write* triggers and hard safety rules stay in the user's global `~/.claude/CLAUDE.md`; this skill is invoked once a write is warranted. Trigger: about to create or update a nerdbrain wiki entity page.

### Agent-skills manifest management

Four skills for maintaining a personal `~/.config/agent-skills/manifest.json` — the whitelist that `agent-skills-sync.sh`/`.ps1` install across Claude Code, Cursor, and any other detected coding agent. Only `apply-manifest-changes` touches the live system; the other three just edit the JSON and then hand off to it.

- **`nerd4rent:add-skill-to-manifest`** — register a new skill (and its source repo, as a plain `npx skills` source or a full Claude plugin marketplace) in the manifest.
- **`nerd4rent:remove-skill-from-manifest`** — drop a skill, or an entire source, from the manifest.
- **`nerd4rent:add-agent-to-manifest`** — add a new coding agent, either always-installed or auto-detected via a PATH/app-bundle probe.
- **`nerd4rent:apply-manifest-changes`** — reconcile the live system to match the manifest: installs what's missing, removes only what a tracked source no longer lists. Always dry-runs and asks for confirmation before mutating anything.

These assume the manifest and sync scripts are already provisioned on the machine (they're chezmoi-managed dotfiles, not something these skills bootstrap from scratch).

## Installation

### Claude Code

Add this marketplace and install the plugin:

```bash
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
/plugin install nerd4rent@nerd4rent-claude-plugin
```

### Other agents (Cursor, Copilot, Windsurf, Cline, …)

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so the [`skills` CLI](https://github.com/vercel-labs/skills) can install them into 70+ coding agents:

```bash
# Install all skills globally into your detected agent(s)
npx skills add nerd4rent/nerd4rent-claude-plugin -g

# Or target a specific agent and/or skill
npx skills add nerd4rent/nerd4rent-claude-plugin -g -a cursor -s '*'

# Keep them current
npx skills update
```

Cursor reads global skills from `~/.agents/skills/` (and `~/.cursor/skills/`); the CLI installs there automatically. Restart the agent after installing.

## Requirements

- `git`
- `gh` (GitHub CLI), authenticated (`gh auth status`)
- `linear-cli` skill installed and configured (or Linear MCP — the skill degrades gracefully if absent)

## License

MIT — see [LICENSE](LICENSE).
