# nerdway

Open-source skills for Claude Code, Cursor, and other coding agents that take a tracker issue from a written spec to a merged pull request. Built for the daily developer workflow at [nerdway](https://nerdway.si).

You describe the work in Linear, GitHub Issues, GitLab Issues, or Azure DevOps Boards. The plugin plans from that issue, implements after you move it to In Progress, reviews the change, and merges when you say so. The repository stays code; the spec and the plan live on the tracker.

## Install

### Claude Code

Add the marketplace:

```
/plugin marketplace add https://github.com/nerdway/nerdway
```

Install the plugin:

```
/plugin install nerdway@nerdway
```

Merges to `main` don't update your install on their own. To pick up a new release, refresh the marketplace first:

```
/plugin marketplace update nerdway
```

Then update the plugin and restart Claude Code:

```
/plugin update nerdway@nerdway
```

### Cursor

**Recommended: team marketplace (updates follow `main`).** In the Cursor dashboard, open **Plugins & MCPs** → **Team Marketplaces** → **Add Marketplace** → **Import from Repo** and paste `https://github.com/nerdway/nerdway`. Cursor reads `.cursor-plugin/marketplace.json`. Install the [Cursor GitHub App](https://github.com/apps/cursor) on this repository, then turn on **Enable Auto Refresh** under Marketplace Settings. Each push to `main` is re-indexed within about 10 minutes, and clients pick it up on their next restart or window focus; **Refresh** forces a re-index. Install `nerdway` from that marketplace in **Customize**.

**Do not use `/add-plugin <this repo URL>`** (the personal GitHub import). Cursor pins that install to the commit it resolved on first import, and Update, Reinstall and running `/add-plugin` again all reuse that snapshot ([forum thread](https://forum.cursor.com/t/add-plugin-github-imports-can-get-stuck-on-stale-plugin-versions/163895)). If you already have that card, uninstall it and remove its marketplace in **Customize** before you install from the team marketplace.

**Local development (no marketplace).** Clone the repository directly into Cursor's local plugin folder. Cursor skips a symlink in `~/.cursor/plugins/local` whose target is outside that folder, so a symlink to a checkout elsewhere does not load.

Create the folder:

```bash
mkdir -p ~/.cursor/plugins/local
```

Clone the plugin into it:

```bash
git clone https://github.com/nerdway/nerdway ~/.cursor/plugins/local/nerdway
```

Then run **Developer: Reload Window** and open **Customize**. The `nerdway` card should list the skills, the five agents, and the hooks. If a marketplace plugin with the same name `nerdway` is installed, it takes precedence over the local copy, so uninstall it first.

To update the local copy later, pull and reload the window again:

```bash
git -C ~/.cursor/plugins/local/nerdway pull
```

Keep **Cursor Settings → Agents → Third-Party Imports** on (the default). With that setting on, a Claude Code install of `nerdway@nerdway` on the same machine can hide a fresher local clone. Keep the Claude Code copy current:

```
claude plugin marketplace update nerdway
```

```
claude plugin update nerdway@nerdway
```

Or uninstall it from Claude Code on a machine where you only use Cursor. Compare the version on the `nerdway` cards in **Customize** with the clone:

```bash
grep '"version"' ~/.cursor/plugins/local/nerdway/.cursor-plugin/plugin.json
```

The session start check also reports an outdated install; see [the user guide](docs/USER-GUIDE.md#the-plugin-tells-you-when-it-is-out-of-date).

### Other agents

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so the [`skills` CLI](https://github.com/vercel-labs/skills) can install them into Copilot, Windsurf, Cline and 70+ other coding agents, and into Cursor as a skills-only alternative to the plugin.

Install all skills globally into the agents it detects:

```bash
npx skills add nerdway/nerdway -g
```

Or target a specific agent:

```bash
npx skills add nerdway/nerdway -g -a cursor -s '*'
```

Keep them current:

```bash
npx skills update
```

Those agents read global skills from `~/.agents/skills/` (Cursor also reads `~/.cursor/skills/`), and the CLI installs there automatically. Restart the agent after installing. This path ships skills only, without the Cursor agents or hooks.

## Quick start

A typical issue, from idea to merged pull request, goes through [`issue-workflow`](skills/issue-workflow/SKILL.md). You steer by moving the issue on the tracker; the agent asks for that move and prints the issue link.

1. Install the CLIs you need from [Requirements](#requirements). The command
   lists the tools and you pick which ones to install. Skip this if you
   prefer: a later skill that needs a missing CLI (for example `gh` for
   GitHub Issues) will offer that one tool and ask yes or no.

   ```
   /bootstrap-clis
   ```

2. In the project repository, record which tracker holds the issues and which host holds the code. The result is a `## Platform` section in the repo `CLAUDE.md`; commit it with your next change.

   ```
   /determine-platform
   ```

3. Say *"create an issue: …"* and describe the work. [`issue-writer`](skills/issue-writer/SKILL.md) drafts the issue, shows it to you, and creates it in Backlog only after you approve. For a fuzzy topic the agent asks its questions in numbered rounds through [`grill`](skills/grill/SKILL.md); a plain yes accepts the recommended answer.

4. Type the issue ID (for example `DEMO-123` or `#123`). [`issue-workflow`](skills/issue-workflow/SKILL.md) posts an implementation plan as a comment and stops.

5. Read the plan on the tracker and move the issue to In Progress. The agent opens a branch and a draft pull request, implements the plan, checks every acceptance criterion, and rewrites the pull request description for reviewers.

6. Review runs next. Say *"merge and close"* when you are satisfied. [`issue-close`](skills/issue-close/SKILL.md) merges and marks the issue done.

The [User Guide](docs/USER-GUIDE.md#a-day-with-the-plugin) follows one feature through these steps in detail.

Other starting points:

- A new repo from an empty directory: say *"start a new project"* ([`new-project-workflow`](skills/new-project-workflow/SKILL.md)).
- One issue, unattended after you approve the draft: `/nerdway:auto-issue-mode` plus a description or an existing ID ([`auto-issue-mode`](skills/auto-issue-mode/SKILL.md)).
- "What's next for this issue?": type the ID with that intent ([`issue-next-step`](skills/issue-next-step/SKILL.md)).

## Skills

Twenty skills ship in `skills/`. Invoke one with `/<name>` or `/nerdway:<name>`.

### Workflow

| Skill | What it does |
|---|---|
| [`issue-workflow`](skills/issue-workflow/SKILL.md) | Status-driven workflow for tracker issues: plan, implement, review, or close-out depending on the issue's phase. |
| [`issue-writer`](skills/issue-writer/SKILL.md) | Create a new tracker issue with clearly specified goals so planning can build an implementation plan from it. |
| [`issue-start`](skills/issue-start/SKILL.md) | Mechanically start work on an in-progress tracker issue: create the branch, open a draft PR/MR, and attach the Fixes magic word. |
| [`issue-next-step`](skills/issue-next-step/SKILL.md) | Diagnose where one tracker issue stands, name its one natural next step, and hand off when you choose. |
| [`issue-close`](skills/issue-close/SKILL.md) | Mechanically close out a tracker issue once the work is done: merge the PR/MR and move the issue to done. |
| [`auto-issue-mode`](skills/auto-issue-mode/SKILL.md) | Run one tracker issue autonomously from a task description or an existing issue ID to a merged PR/MR and the done phase. |
| [`grill`](skills/grill/SKILL.md) | Interview one question at a time until shared understanding, with a recommended answer each turn. |
| [`tdd`](skills/tdd/SKILL.md) | Test-first implementation loop: red, verify red, green, refactor, check - one test and one minimal change per cycle. |
| [`debug`](skills/debug/SKILL.md) | Find the cause of a failure before touching the fix: rank hypotheses, settle them with the smallest evidence, then fix only what the evidence justifies. |

### Project

| Skill | What it does |
|---|---|
| [`new-project-workflow`](skills/new-project-workflow/SKILL.md) | Bootstrap a new development project end-to-end: git, README, GitHub repo, Linear project, optional wiki, then a spec-creating skill. |
| [`project-continue`](skills/project-continue/SKILL.md) | Answer "where are we" for the current project: verify the newest checkpoint against the repo and tracker, and record a fresh one with consent. |
| [`nerd-orchestrate`](skills/nerd-orchestrate/SKILL.md) | Orchestrate a project's unplanned issues: report progress, plan every open issue without a plan comment, then ask before auto-issue-mode. |
| [`determine-platform`](skills/determine-platform/SKILL.md) | Establish which tracker holds the project's issues and which VCS host holds its code, and record that as the Platform section of CLAUDE.md. |
| [`bind-statuses`](skills/bind-statuses/SKILL.md) | Bind the five canonical workflow phases to how the project's tracker shows them and record the map in the repo CLAUDE.md. |
| [`retro`](skills/retro/SKILL.md) | Turn the lessons of the current session into tracker issues: propose candidates by category and hand accepted ones to issue-writer. |

### Vault

| Skill | What it does |
|---|---|
| [`nerdbrain-search`](skills/nerdbrain-search/SKILL.md) | The four recall operations of the nerdbrain Obsidian vault: phrase search, outgoing links, backlinks, and 1-hop graph assembly. |
| [`nerdbrain-wiki`](skills/nerdbrain-wiki/SKILL.md) | How to create or update a nerdbrain second-brain entity page in the user's Obsidian vault. |
| [`nerd-personal-docs`](skills/nerd-personal-docs/SKILL.md) | Write or update a human-readable guide in the nerdbrain vault whenever finished work created or changed something the user will use. |
| [`nerd-documentation-write`](skills/nerd-documentation-write/SKILL.md) | Conventions for writing or revising a tutorial, README, or step-by-step guide meant to be read by people outside your own tooling stack. |

### Meta

| Skill | What it does |
|---|---|
| [`bootstrap-clis`](skills/bootstrap-clis/SKILL.md) | List the required CLIs and install only the ones you select. A skill that needs a missing tool offers that one install as a yes/no. Full reconcile is `--all`. |

The [User Guide skills reference](docs/USER-GUIDE.md#skills-reference) lists trigger phrases and what happens for each skill.

## Requirements

A coding agent: [Claude Code](https://claude.com/claude-code), [Cursor](#cursor), or [another agent](#other-agents) that reads Agent Skills. The parallel planning and review steps need Claude Code 2.1.154 or newer on a plan that includes dynamic workflows; without them the same steps run one after another.

These CLIs on your `PATH`:

| CLI | Minimum version | Needed for |
|---|---|---|
| `git` | 2.40 | every project |
| `node` (with npm) | 24 | every project |
| `gh` (GitHub CLI) | 2.97 | GitHub-hosted repos or GitHub Issues |
| `linearis` (Linear CLI) | 2026.7.0 | Linear |
| `glab` (GitLab CLI) | 1.117 | GitLab-hosted repos or GitLab Issues |
| `jq` | 1.6 | GitLab Issues or Azure DevOps Boards |
| `az` (Azure CLI) | 2.90 | Azure DevOps-hosted repos or Azure DevOps Boards |
| `rg` (ripgrep) | 14 | search |

You don't have to install the CLIs by hand. Once the plugin is installed,
`/bootstrap-clis` lists the tools in the table and you multi-select which to
install. A skill that needs a missing CLI asks yes or no for that one tool;
you do not have to run `/bootstrap-clis` first. To probe and install every
entry (a fresh full machine, or plugin development), pass `--all` to
`scripts/bootstrap-clis.ts`. Authentication is never done for you: the skill
hands back only the login steps a human has to complete.

To authenticate `linearis`, create a personal API key in Linear under **Settings → Security & access → API → Personal API keys**, then either set it as the `LINEAR_API_TOKEN` environment variable or run `linearis auth login`. The key does not expire. Other CLIs use their usual login: `gh auth login`, `glab auth login`, `az login` or `az devops login`. After `az`, add the DevOps extension with `az extension add --name azure-devops`.

Install notes, day-to-day steering, and the full skill reference are in the [User Guide](docs/USER-GUIDE.md).

## Docs, support, and contributing

- [User Guide](docs/USER-GUIDE.md): a day with the plugin, steering with statuses, and the reference of every skill with its trigger phrases.
- [Support](docs/SUPPORT.md): MIT license, GitHub Issues, and https://nerdway.si.
- [Contributing](docs/CONTRIBUTING.md): checking a change and releasing a version.

Report bugs and propose changes in [GitHub Issues](https://github.com/nerdway/nerdway/issues). Pull requests are welcome.

The source is MIT. Details are in [Support](docs/SUPPORT.md).

## License

MIT, see [LICENSE](LICENSE).
