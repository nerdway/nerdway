# nerd4rent-claude-plugin

Open-source skills for Claude Code, Cursor and other coding agents that take a tracker issue from specification to a merged pull request, built for the daily developer workflow at [Nerd4Rent](https://nerd4rent.io).

## Spec in the tracker

Spec-driven frameworks keep the specification and the plan as files in the repository. This plugin keeps them in the tracker (Linear, GitHub Issues, GitLab Issues or Azure DevOps Boards), where the rest of the work already lives:

- the issue description is the spec: what to build and why, with acceptance criteria that each name the test or command proving them;
- an `## Implementation plan` comment is the plan: how, including the files it will change;
- `## Spec change` comments record every change to the spec after work started, and why;
- a `## Session summary` comment after each working session is enough to resume the work from the tracker alone.

The repository holds code only. Everything about one piece of work sits in one dated thread next to its status, readable by anyone with access to the tracker, and developers who don't use your tracker see clean code and a pull request description. You steer the agent by moving the issue between statuses: moving it to In Progress is the approval that unlocks code changes. The [User Guide](docs/USER-GUIDE.md#the-spec-lives-in-the-issue) walks through the path from spec to verified change, and [ADR-0008](docs/adr/0008-spec-in-issue-description.md) records the decision.

## Requirements

A coding agent: [Claude Code](https://claude.com/claude-code), [Cursor](#cursor), or [another agent](#other-agents) that reads Agent Skills. The parallel planning and review steps need Claude Code 2.1.154 or newer on a plan that includes dynamic workflows; without them the same steps run one after another.

These CLIs on your `PATH`:

| CLI | Minimum version | Install | Authentication |
|---|---|---|---|
| `git` | 2.40 | your package manager | none |
| `node` (with npm) | 22 | <https://nodejs.org> | none |
| `gh` (GitHub CLI) | 2.97 | `brew install gh` / `winget install GitHub.cli` | `gh auth login` |
| `linearis` (Linear CLI), Linear only | 2026.7.0 | `npm i -g linearis` | see below |
| `glab` (GitLab CLI), GitLab-hosted repos or GitLab Issues only | 1.117 | `brew install glab` / `winget install GLab.GLab` | `glab auth login` (token scopes `api`, `write_repository`) |
| `jq`, GitLab Issues or Azure DevOps Boards only | 1.6 | `brew install jq` / `winget install jqlang.jq` | none |
| `az` (Azure CLI), Azure DevOps-hosted repos or Azure DevOps Boards only | 2.90 | `brew install azure-cli` / `winget install Microsoft.AzureCLI`, then `az extension add --name azure-devops` | `az login` or `az devops login` |
| `rg` (ripgrep) | 14 | `brew install ripgrep` / `winget install BurntSushi.ripgrep.MSVC` | none |

To authenticate `linearis`, create a personal API key in Linear under **Settings → Security & access → API → Personal API keys**, then either set it as the `LINEAR_API_TOKEN` environment variable or run `linearis auth login`. The key does not expire.

You don't have to install the CLIs by hand: once the plugin is installed, `/bootstrap-clis` probes every dependency, installs or updates what is missing, and hands you back only the authentication steps a human has to complete.

## Installation

### Claude Code

Add the marketplace:

```
/plugin marketplace add https://github.com/nerd4rent/nerd4rent-claude-plugin
```

Install the plugin:

```
/plugin install nerd4rent@nerd4rent-claude-plugin
```

Merges to `main` don't update your install on their own. To pick up a new release, refresh the marketplace first:

```
/plugin marketplace update nerd4rent-claude-plugin
```

Then update the plugin and restart Claude Code:

```
/plugin update nerd4rent@nerd4rent-claude-plugin
```

In the default permission mode each parallel planning or review run asks for consent first; answer "don't ask again" to silence the prompt for that workflow in that project.

### Cursor

**Recommended: team marketplace (updates follow `main`).** In the Cursor dashboard, open **Plugins & MCPs** → **Team Marketplaces** → **Add Marketplace** → **Import from Repo** and paste `https://github.com/nerd4rent/nerd4rent-claude-plugin`. Cursor reads `.cursor-plugin/marketplace.json`. Install the [Cursor GitHub App](https://github.com/apps/cursor) on this repository, then turn on **Enable Auto Refresh** under Marketplace Settings. Each push to `main` is re-indexed within about 10 minutes, and clients pick it up on their next restart or window focus; **Refresh** forces a re-index. Install `nerd4rent` from that marketplace in **Customize**.

**Do not use `/add-plugin <this repo URL>`** (the personal GitHub import). Cursor pins that install to the commit it resolved on first import, and Update, Reinstall and running `/add-plugin` again all reuse that snapshot ([forum thread](https://forum.cursor.com/t/add-plugin-github-imports-can-get-stuck-on-stale-plugin-versions/163895)). If you already have that card, uninstall it and remove its marketplace in **Customize** before you install from the team marketplace.

**Local development (no marketplace).** Clone the repository directly into Cursor's local plugin folder. Cursor skips a symlink in `~/.cursor/plugins/local` whose target is outside that folder, so a symlink to a checkout elsewhere does not load.

Create the folder:

```bash
mkdir -p ~/.cursor/plugins/local
```

Clone the plugin into it:

```bash
git clone https://github.com/nerd4rent/nerd4rent-claude-plugin ~/.cursor/plugins/local/nerd4rent
```

Then run **Developer: Reload Window** and open **Customize**. The `nerd4rent` card should list the skills, the five agents, and the SessionStart and vault-MCP deny hooks. If a marketplace plugin with the same name `nerd4rent` is installed, it takes precedence over the local copy, so uninstall it first.

To update the local copy later, pull and reload the window again:

```bash
git -C ~/.cursor/plugins/local/nerd4rent pull
```

**Third-Party Imports.** Keep **Cursor Settings → Agents → Third-Party Imports** ("Include Third-Party Plugins, Skills, and Other Configs") on, which is the default. Cursor then loads the repo `CLAUDE.md` into context as an always-applied rule, so the project's general instructions apply in Cursor too. The plugin's workflow does not depend on it: every skill reads the project's platform settings from `CLAUDE.md` on disk, so they resolve the same way with the setting off.

### Other agents

The skills follow the shared [Agent Skills specification](https://github.com/vercel-labs/skills), so the [`skills` CLI](https://github.com/vercel-labs/skills) can install them into Copilot, Windsurf, Cline and 70+ other coding agents, and into Cursor as a skills-only alternative to the plugin.

Install all skills globally into the agents it detects:

```bash
npx skills add nerd4rent/nerd4rent-claude-plugin -g
```

Or target a specific agent:

```bash
npx skills add nerd4rent/nerd4rent-claude-plugin -g -a cursor -s '*'
```

Keep them current:

```bash
npx skills update
```

Those agents read global skills from `~/.agents/skills/` (Cursor also reads `~/.cursor/skills/`), and the CLI installs there automatically. Restart the agent after installing. This path ships skills only, without the Cursor agents or hooks.

## First steps

1. Bring the CLIs from [Requirements](#requirements) up to date:

   ```
   /bootstrap-clis
   ```

2. In the project repository, record which tracker holds the issues and which host holds the code. The result is a `## Platform` section in the repo `CLAUDE.md`; commit it with your next change.

   ```
   /determine-platform
   ```

3. Say *"create an issue: …"* and describe the work. The agent drafts the issue, shows it to you, and creates it in Backlog only after you approve.
4. Type the issue ID (for example `DEMO-123` or `#123`). The agent posts an implementation plan as a comment and stops.
5. Read the plan on the tracker and move the issue to In Progress. The agent opens a branch and a draft pull request, implements the plan, and checks every acceptance criterion.
6. Review runs next; say *"merge and close"* when you are satisfied.

The [User Guide](docs/USER-GUIDE.md#a-day-with-the-plugin) follows one feature through these steps in detail.

## Documentation

- [User Guide](docs/USER-GUIDE.md): the ideas behind the plugin, a day with it, steering with statuses, and the reference of every skill with its trigger phrases.
- [Architecture](docs/ARCHITECTURE.md): the platform config and adapters, the plugin's agents, and the workflow contract.
- [Contributing](docs/CONTRIBUTING.md): checking a change and releasing a version.
- [Architecture decision records](docs/adr/): why the design is the way it is.

## License

MIT, see [LICENSE](LICENSE).
