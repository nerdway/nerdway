# User Guide

This guide is for developers who want to install and use the **nerd4rent** Claude Code plugin day to day. It walks you through prerequisites, installation, and how to drive each skill — no knowledge of the plugin's internals required.

If you want to know how the plugin is built (workflow topology, contracts, validators), see [`README.md`](../README.md) and [`CONTEXT.md`](../CONTEXT.md) instead.

## What you get

The plugin bundles skills that automate a complete issue lifecycle on top of [Linear](https://linear.app) and GitHub:

1. **Create** a well-formed Linear issue from a conversation (`linear-issue-writer`).
2. **Plan and implement** it, steered by the issue's status in Linear (`linear-issue-workflow`).
3. **Close it out** — merge the PR and mark the issue Done (`linear-issue-close`).

Plus supporting skills: project bootstrap, machine setup, personal-wiki maintenance, and agent-skills manifest management.

## Prerequisites

You need [Claude Code](https://claude.com/claude-code) (or another coding agent — see [Other agents](#other-agents)) and these CLIs on your `PATH`:

| CLI | Minimum version | Install | Authentication |
|---|---|---|---|
| `git` | 2.40 | your package manager | — |
| `node` (with npm) | 22 | <https://nodejs.org> | — |
| `gh` (GitHub CLI) | 2.97 | `brew install gh` / `winget install GitHub.cli` | `gh auth login` |
| `linearis` (Linear CLI) | 2026.7.0 | `npm i -g linearis` | see below |
| `rg` (ripgrep) | 14 | `brew install ripgrep` / `winget install BurntSushi.ripgrep.MSVC` | — |

To authenticate `linearis`, create a personal API key in Linear under **Settings → Security & access → API → Personal API keys**, then either set it as the `LINEAR_API_TOKEN` environment variable or run `linearis auth login`. The key does not expire.

You don't have to set this up by hand: once the plugin is installed, run `/nerd4rent:bootstrap-clis` and the agent will probe every dependency, install or update what's missing, and hand you back only the authentication steps a human has to complete.

The Linear-based skills degrade gracefully — if `linearis` is missing or unauthenticated, the rest of the plugin still works.

## Installation

In Claude Code, add the marketplace and install the plugin:

```
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
/plugin install nerd4rent@nerd4rent-claude-plugin
```

To update later:

```
/plugin marketplace update nerd4rent-claude-plugin
/plugin update nerd4rent@nerd4rent-claude-plugin
```

Merges to `main` don't update your install on their own — the two commands above are what refresh your local copy, and only a release with a bumped plugin version produces an actual update.

### Other agents

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so you can install them into Cursor, Copilot, Windsurf, Cline and 70+ other agents:

```bash
npx skills add nerd4rent/nerd4rent-claude-plugin -g   # all skills, detected agents
npx skills update                                     # keep them current
```

Restart the agent after installing. Agents other than Claude Code run every workflow sequentially (they have no workflow runtime), but the skills are written to work that way too — nothing breaks, things just run one step at a time.

## Quick start: a day with the plugin

A typical feature, from idea to merged PR:

1. **File the issue.** In a session inside your repo, say *"create an issue: …"* and describe what you want. The agent interviews you if the goal is fuzzy, drafts the issue body, shows it to you, and — after your approval — creates it in Linear, in **Backlog**.
2. **Get a plan.** Type the issue ID (e.g. `DEMO-123`) in a new message. The agent gathers context (repo, docs, related issues), drafts an implementation plan, posts it as a comment on the issue, and sets the status to **Todo**. Then it stops.
3. **Approve by moving the status.** Read the plan in Linear. When you're happy with it, drag the issue to **In Progress**. That status change *is* the approval — the agent never asks you to "confirm the plan" in chat.
4. **Implement.** Type the issue ID again (or continue the session). Seeing In Progress, the agent creates a branch named after the issue, opens a **draft PR** wired to auto-close the issue on merge, and implements the plan, committing as it goes.
5. **Review.** After implementation (or when you set the status to **In Review**), the agent offers a code review: four independent review axes (does it match the issue? does it follow repo standards? is it correct? is it secure?), with every finding adversarially double-checked before it's shown to you. Fixes get pushed to the same PR.
6. **Close.** Say *"merge and close"* (or set the issue to **Done**). The agent commits any leftovers, pushes, merges the PR, switches your checkout back to the base branch, and marks the issue Done in Linear.

After every working session the agent posts a `## Session summary` comment on the issue, so you can resume from Linear alone — even in a fresh session days later.

## Steering with Linear statuses

The issue's status in Linear is the single source of truth for what the agent does next. You steer by moving the issue; the agent re-reads the status every turn.

| You set the status to… | The agent… |
|---|---|
| **Backlog** / **Todo** | drafts or refines the implementation plan, posts it to Linear, stops |
| **In Progress** | implements: branch, draft PR, code, commits — this is the only status that unlocks repo changes |
| **In Review** | runs the code review and pushes fixes |
| **Done** (with the PR still open) | closes out: merges the PR, syncs your checkout |

Two things only you can do: move an issue to **In Progress** (the agent will never do it by itself to unlock implementation — though asking it in chat to implement counts as approval), and merge decisions are always surfaced to you before anything irreversible happens.

## Skills reference

How to trigger each skill and what to expect. All of them also respond to the slash form `/nerd4rent:<skill-name>`.

### `linear-issue-writer` — file a new issue

- **Say:** *"create an issue"*, *"new task"*, *"utwórz/zgłoś issue"* — anything expressing intent to file new work, with no existing issue ID.
- **What happens:** the agent resolves the target team/project (and confirms it), interviews you only if the goal is unclear, shows you the drafted body, and creates the issue in Backlog only after you approve. For big topics it can split the work into real sub-issues, and optionally run a "grilling session" — a one-question-at-a-time interrogation that sharpens the requirements before any planning starts.

### `linear-issue-workflow` — plan, implement, review

- **Say:** any Linear issue ID (`DEMO-123`) with intent to work on it — *"plan DEMO-123"*, *"zrealizuj DEMO-123"*, or just the bare ID.
- **What happens:** the status-driven flow described [above](#steering-with-linear-statuses). During planning and review it may launch parallel *workflow islands* (see [the consent prompt](#the-workflow-consent-prompt)); during implementation it offers whichever implementation-style skills you have installed (TDD, subagent-driven, or plain).

### `linear-issue-close` — merge and finish

- **Say:** *"merge and close"*, *"close out DEMO-123"*, *"domknij"*, *"zmerguj i zamknij"*.
- **What happens:** a deliberately mechanical close-out — commit leftovers, push, merge the PR (GitHub or GitLab), switch your checkout to the base branch, set the issue to Done. On any error (merge conflict, missing CLI) it stops and reports instead of improvising.

### `new-project-workflow` — bootstrap a project

- **Say:** *"start a new project"*, *"bootstrap this project"* — typically from an empty directory.
- **What happens:** git init, `README.md` scaffold, GitHub repo via `gh`, a matching Linear project, and a hand-off to a spec-writing interview. One approval up front covers the whole sequence.

### `bootstrap-clis` — set up a machine

- **Say:** `/nerd4rent:bootstrap-clis`, or just let a skill fail because a CLI is missing.
- **What happens:** every dependency from the table above is probed, installed, or updated (with checksum verification for downloads). Authentication is never done for you — the skill ends with the exact steps you need to run yourself.

### `nerdbrain-wiki` / `nerdbrain-search` — personal second brain (optional)

These maintain a personal Obsidian vault ("second brain") with one entity page per project — the agent recalls project decisions at planning time and records new ones as they're made. They assume a specific vault layout under `~/obsidian/nerdbrain/` and matching rules in your global `~/.claude/CLAUDE.md`; without that setup they simply stay inactive. Safe to ignore unless you want to replicate the whole setup.

### Agent-skills manifest management (optional)

Four skills (`add-skill-to-manifest`, `remove-skill-from-manifest`, `add-agent-to-manifest`, `apply-manifest-changes`) maintain a personal `~/.config/agent-skills/manifest.json` — a whitelist of skills to install across all your coding agents (Claude Code, Cursor, …). They assume the manifest and its sync scripts are already provisioned on your machine (e.g. via dotfiles). Say *"add this skill to the manifest"*, *"sync my skills"*, etc.

## The workflow consent prompt

During the **plan** and **review** phases in Claude Code, the agent runs parallel *workflow islands* — multi-agent fan-outs that gather context or review your diff along four axes concurrently. In the default permission mode, each run asks for your consent first. This is normal; answer **"don't ask again"** to silence the prompt for that workflow in that project.

Workflows need Claude Code ≥ 2.1.154 on a plan that includes them. Without them (older version, disabled in `/config`, or another agent entirely) everything still works — the same steps just run sequentially, and a bit slower.

## Troubleshooting

- **`Issue with identifier "X" not found`** — wrong team prefix or workspace; check `linearis teams list`.
- **`Status "X" for team ... not found`** — Linear statuses are your team's own names, spelled exactly (`In Progress`, not `in progress`).
- **`linearis` errors about authentication** — set `LINEAR_API_TOKEN` or run `linearis auth login` (see [Prerequisites](#prerequisites)).
- **`/plugin update` says nothing changed** — run `/plugin marketplace update nerd4rent-claude-plugin` first; if it still reports no change, no new version has been released yet.
- **A skill doesn't trigger** — invoke it explicitly with the slash form, e.g. `/nerd4rent:linear-issue-workflow DEMO-123`.
