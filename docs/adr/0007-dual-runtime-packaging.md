# Dual-runtime packaging and a Cursor-native SessionStart

*Amended by DEMO-455: SessionStart is now one script, `hooks/session-start.ts`, with two JSON envelopes chosen by `--runtime claude|cursor`, the way the install check and the issue hooks already work through `renderContextOutput`. `hooks/hooks.json` runs it for Claude Code next to the install check, so a cloud session gets the inject too, and `~/.claude/hooks/nerdbrain-load.sh` is switched off by hand. The rejected alternative "One SessionStart script, two JSON envelopes" below no longer holds: the envelopes differ only in the wrapper, and the script lives in the plugin, not in `~/.claude`.*

The plugin must load as a native plugin in Cursor (skills, agents, hooks)
without changing Claude Code behaviour and without making `npx skills add`
the only Cursor path. Cursor and Claude Code speak different manifest and
hook JSON contracts; one shared `nerdbrain-load.sh` cannot emit both.

We keep **two runtime manifests, one `skills/` and one `agents/`**:

| Runtime | Manifest | Loads |
|---------|----------|-------|
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json` | skills, agents, `workflows/*.js` islands, `/nerdway:` slashes |
| Cursor | `.cursor-plugin/plugin.json` | `skills/`, `agents/`, `hooks/cursor.hooks.json` |

**Claude Code must never see a file in another runtime's format.** Claude
Code reads some paths by convention, whatever `.claude-plugin/plugin.json`
declares: `hooks/hooks.json` is auto-discovered and merged with the
manifest's `hooks`, and a root `plugin.json` is its fallback manifest.
Those paths stay empty of Cursor files. `.cursor-plugin/plugin.json` names
`name: nerdway` and explicit `./skills/`, `./agents/` and
`./hooks/cursor.hooks.json` paths (an explicit field *replaces* Cursor's
auto-discovery, so Cursor never falls back to `hooks/hooks.json`).
`.cursor-plugin/marketplace.json` lists the single plugin (`source: "./"`)
under Cursor's closed marketplace schema, so Cursor's GitHub import and a
team marketplace "Import from Repo" do not rely on the fallback read of
`.claude-plugin/marketplace.json`, whose `strict` key Cursor's schema rejects.
It does not unpin a personal `/add-plugin` install, because that pin is a
server-side `gitRef` on the Cursor account.

SessionStart is a **separate script per runtime**. Claude Code stays on
`~/.claude/hooks/nerdbrain-load.sh` (`hookSpecificOutput.SessionStart`).
The plugin ships `hooks/session-start.ts`, invoked as
`node ./hooks/session-start.ts`, which prints
`{ "additional_context": "…" }` for Cursor. Both implement the same
lazy-sections contract (whitelist, 8192-byte budget, slug, kill-switch,
no-op inside the vault). They do not share a file: the JSON I/O contracts
differ. Vault-MCP deny (`beforeMCPExecution` / `preToolUse`, `failClosed`)
lives next to the Cursor hook, in `hooks/cursor.hooks.json`, as
`node ./hooks/deny-vault-mcp.ts`. Hook commands are relative to the plugin
root and start with `node` (DEMO-394).

## Correction (DEMO-364)

The first version of this ADR (DEMO-311, 0.30.0) shipped Cursor's hooks as
`hooks/hooks.json` and an Agent Plugins manifest as root `plugin.json`,
assuming Claude Code would not look at either. That was wrong:

- `.claude-plugin/plugin.json` has no `hooks` field, so Claude Code loaded
  `hooks/hooks.json` by convention. `claude plugin validate` only warned
  (`hooks.sessionStart: unknown hook event; entry ignored at runtime`, the
  same for `beforeMCPExecution` and `preToolUse`) and a local install still
  worked, so nothing looked broken.
- The claude.ai marketplace sync validates plugins server-side, stricter
  than the CLI: a hook entry the approval UI cannot display fails the sync
  (`failed_content`). A failed sync keeps the account on the last synced
  version, so claude.ai stayed on 0.29.0 — the last release before DEMO-311
  — from 0.30.0 to 0.35.0.
- Claude Code reads a root `plugin.json` as its manifest when
  `.claude-plugin/plugin.json` is missing, so that file was Claude
  Code-visible too.

Fix: the Cursor hooks moved to `hooks/cursor.hooks.json`, named in
`.cursor-plugin/plugin.json`, and the root `plugin.json` is gone. Two
guards keep it that way: `scripts/validate-manifests.ts` fails when
anything sits at `hooks/hooks.json` or root `plugin.json` or when the Cursor
manifest points at them, and `scripts/validate-claude-plugin.ts` fails on
any `claude plugin validate` warning. Both run locally before a release
(the repo has no CI yet).
Should the plugin ever ship Claude Code hooks, they go to
`hooks/hooks.json` in Claude Code's format, with the isolation guard
updated in the same change.

## Claude Code hooks (DEMO-413)

The plugin now ships one Claude Code hook: `hooks/hooks.json`, in Claude
Code's own format (a `hooks` object keyed by PascalCase event names), with a
`SessionStart` entry on `startup|resume|clear` that runs
`hooks/check-install.sh claude`. That wrapper locates the plugin from its
own path, exits silently when `node` is not on `PATH`, and runs
`node scripts/check-install.ts --runtime claude`. Cursor's second
`sessionStart` entry calls `node ./scripts/check-install.ts --runtime cursor`
directly (DEMO-394). The detection itself is pure functions in
`scripts/lib/install-check.ts` under `node:test`.

The check answers two questions before a session works on the skills: is
the installed plugin older than `main` (the raw `.claude-plugin/plugin.json`
of `main`, fetched with a 3 second timeout and cached for 24 hours in
`CLAUDE_PLUGIN_DATA`, else `~/.cache/nerdway`), and do stale copies of the
plugin's skills sit in the user's skill directories (`~/.claude/skills`,
`~/.cursor/skills`, `~/.agents/skills` and the same three under the project;
a copy is a `SKILL.md` whose `name` is a historical plugin skill name, or a
current one with `nerdway` or `nerdbrain` in the text). Neither runtime
signals a newer version itself: Claude Code auto-updates only Anthropic
marketplaces, and the Cursor CLI has no plugin update command. On 2026-10-10
Claude Code ran six releases behind `main` and Cursor loaded four June
copies, with no signal in either. A hook is the only mechanism that runs in
every session without anyone remembering to ask; `project-continue` and
`bootstrap-clis` run on request, so they would have missed exactly that
case. The islands (`workflows/*.js`) have no filesystem or network
(ADR-0003), so the check cannot live there.

Output is one English line per finding with the remedy for the runtime
(Claude Code: `/plugin marketplace update` then `/plugin update`; Cursor:
`git pull --ff-only` for a clone under `~/.cursor/plugins/local/`, else
re-add the marketplace and reinstall the card; a stale copy: its path and
"remove it"). Claude Code gets `systemMessage` plus
`hookSpecificOutput.additionalContext`, Cursor `additional_context`; both
open with an instruction to repeat the warning to the user in the first
reply, because in Cursor that is the only channel. No drift and no copies
print nothing. A network failure is silent and leaves no cache entry;
`claude.ai/code` blocks `raw.githubusercontent.com`, so the version check is
silent there. Missing `node` in the hook's PATH exits silently too.

The isolation guard in `scripts/validate-manifests.ts` changed in the same
PR: `hooks/hooks.json` is accepted when it has Claude Code's shape and still
rejected in Cursor's shape (`version: 1`, camelCase events); a root
`plugin.json` stays forbidden. Only `NERDWAY_MAIN_VERSION`,
`NERDWAY_SKILL_DIRS` and `NERDWAY_CACHE_DIR` override the check, for the
acceptance runs; there is no kill switch. The one risk is the claude.ai
sync: it rejected unknown hook events in DEMO-364, and a `SessionStart` entry
in Claude Code's format has not been through it before 0.55.0. If it fails,
0.55.1 drops `hooks/hooks.json` and Claude Code falls back to a step in
`project-continue`.

## Cursor hook commands start with node (DEMO-394)

Cursor has one command string for every operating system. A command that is
only a path to a `.sh` file is opened by the system shell. On Windows that
shell resolves `.sh` through the file association: Git Bash opens a window
whose stdio is not connected to Cursor, a hidden `wscript` launcher drops
stdin and stdout, and `bash` on `PATH` is WSL. The hook then prints nothing.
With `failClosed: true` every tool is denied.

A command that starts with an interpreter never consults that association.
`hooks/cursor.hooks.json` calls `node ./hooks/session-start.ts`,
`node ./hooks/deny-vault-mcp.ts`, and
`node ./scripts/check-install.ts --runtime cursor`. `hooks/check-install.sh`
stays for Claude Code. The TypeScript files use only the Node standard
library and syntax Node 24 runs without a build (type stripping). `node`
comes from `PATH`. There is no absolute path and no search: a Cursor
process started from the Dock may not have `node`, and that stays a manual
check on macOS.

## Repo `CLAUDE.md` and `## Platform` in Cursor (DEMO-366)

Every nerd-workflow project records its platform as the `## Platform`
section of the repo `CLAUDE.md`. Skills were written against Claude Code,
which always puts that file into context, so most of them named the section
without saying to read the file. Cursor puts the repo `CLAUDE.md` into
context only while **Settings → Agents → Third-Party Imports** is on (the
default; in Cursor CLI 2026.09.28 the loader is gated on that switch, while
`AGENTS.md` loads regardless). With it off, those skills fell through to the
entity page or stopped with "no platform configured".

Decision: every skill reads the section **from disk** with one recipe,
`adapters/platform.md`. The script path is
`node scripts/validate-platform-config.ts --print <repo>/CLAUDE.md` (JSON on
stdout; exit `0` found, `3` absent, `4` broken; `1` stays Node's own
failure), and a manual read of the line-start section is the fallback
without Node 22. A `CLAUDE.md` in the
context is never a source: Claude Code does not reload it after
`determine-platform` or `bind-statuses` writes it, and Cursor may not have
loaded it at all. `scripts/validate-platform-references.ts` (and its test)
fail when a skill, agent or adapter mentions `## Platform` without pointing
at the recipe. Third-Party Imports stays recommended in the README for the
rest of the project instructions, but nothing depends on it. The root
`CLAUDE.md` of this repo keeps its `## Platform`; Claude Code reports it as
"not loaded as project context", which is expected and allowlisted.

`npx skills add` remains the fallback for agents without a native plugin
loader. Agent frontmatter keeps Claude Code keys (`tools:`, `model:`
aliases, `skills:` on the gatherer) and adds `readonly: true`; Cursor
model IDs are not substituted in.

## Considered Options

- **Agent Plugins only (skills, no Cursor Plugin)** — rejected: SessionStart
  and agents are acceptance criteria; Agent Plugins 1.0.0 does not load
  Cursor hooks or `agents/`.
- **Root `plugin.json` (Agent Plugins 1.0.0) next to the Cursor manifest** —
  reversed (DEMO-364): Claude Code reads it as a fallback manifest, Cursor
  prefers `.cursor-plugin/plugin.json`, and agents without a native loader
  use `npx skills add`. It added Claude Code exposure and no reach.
- **Cursor hooks at the conventional `hooks/hooks.json`** — reversed
  (DEMO-364): Claude Code auto-discovers that path; see Correction above.
- **One SessionStart script, two JSON envelopes** — rejected: Claude Code
  and Cursor disagree on the output shape, and a shared file would couple
  plugin releases to `~/.claude` machine infra (ADR-0001 / DEMO-205).
- **Replace `npx skills` as the Cursor path and drop it** — rejected: Copilot,
  Windsurf, Cline and any agent without a native plugin loader still need
  it. The 2026-06-14 wiki decision stays as the fallback, not as Cursor's
  only install.
- **Substitute Cursor model IDs in `agents/`** — rejected: that would break
  the Haiku/Sonnet pins Claude Code islands rely on. Cursor docs require
  only `name` + `description`; extra keys are ignored.
- **Inject `## Platform` from the repo `CLAUDE.md` in Cursor's
  sessionStart** — rejected (DEMO-366): skills read the file from disk
  anyway, a second copy in context could drift from it, and Cursor runs the
  hook fire-and-forget.
- **Require Third-Party Imports for the nerd workflow in Cursor** — rejected
  (DEMO-366): a user setting is not a contract; the recipe works either way.
- **No `.cursor-plugin/marketplace.json`** — reversed (DEMO-345): the file does
  not unstick a personal `/add-plugin` pin. But Cursor documents it as required
  for GitHub imports, and a team marketplace imported from the repo with
  Auto Refresh follows `main`. That is the only path that stays current.

## Consequences

- Three version strings move in lockstep:
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
  (`metadata.version`), `.cursor-plugin/plugin.json`.
  `scripts/validate-manifests.ts` checks the three, Cursor's closed
  schemas and the Claude Code isolation above; drift exits non-zero.
- `node scripts/validate-claude-plugin.ts` (Claude Code CLI required) must
  report no warnings before a release; the only allowlisted one is the
  root `CLAUDE.md` notice.
- The claude.ai sync validates the plugin against claude.ai's upload
  rules, which `claude plugin validate` does not check, and reports a
  breach as a sync warning (DEMO-365): plugin `description` at most 500
  characters, skill and agent `name`/`description` without `<` or `>`.
  `scripts/validate-manifests.ts` enforces them and keeps the plugin
  description identical in all four manifests.
- `.claude-plugin/` is edited only for that lockstep version and the
  shared plugin description. Islands
  (`workflows/*.js`) and `/nerdway:` slashes stay Claude Code's runtime.
- Cursor `sessionStart` is fire-and-forget; the inject may arrive after
  the first turn. Skills already know to `Read` the entity page from disk
  when the inject is missing (nerdbrain-wiki lazy-section contract).
- A Cursor marketplace card with `name: nerdway` wins over a local
  copy. Local install is a `git clone` straight into
  `~/.cursor/plugins/local/nerdway`, not a symlink. Cursor skips symlinks
  that point outside that folder. Uninstall the marketplace card first.
- `~/.claude/hooks/nerdbrain-load.sh` and the Claude Code vault-MCP deny
  in `~/.claude/settings.json` stay outside this repo.
- A skill that needs the platform reads the repo `CLAUDE.md` through
  `adapters/platform.md`; `scripts/validate-platform-references.ts` must
  pass before a release. How the global `~/.claude/CLAUDE.md` rules reach
  Cursor is open (DEMO-368).
