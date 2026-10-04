# Dual-runtime packaging and a Cursor-native SessionStart

The plugin must load as a native plugin in Cursor (skills, agents, hooks)
without changing Claude Code behaviour and without making `npx skills add`
the only Cursor path. Cursor and Claude Code speak different manifest and
hook JSON contracts; one shared `nerdbrain-load.sh` cannot emit both.

We keep **two runtime manifests, one `skills/` and one `agents/`**:

| Runtime | Manifest | Loads |
|---------|----------|-------|
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json` | skills, agents, `workflows/*.js` islands, `/nerd4rent:` slashes |
| Cursor | `.cursor-plugin/plugin.json` | `skills/`, `agents/`, `hooks/cursor.hooks.json` |

**Claude Code must never see a file in another runtime's format.** Claude
Code reads some paths by convention, whatever `.claude-plugin/plugin.json`
declares: `hooks/hooks.json` is auto-discovered and merged with the
manifest's `hooks`, and a root `plugin.json` is its fallback manifest.
Those paths stay empty of Cursor files. `.cursor-plugin/plugin.json` names
`name: nerd4rent` and explicit `./skills/`, `./agents/` and
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
The plugin ships `hooks/session-start.sh` that prints
`{ "additional_context": "…" }` for Cursor. Both implement the same
lazy-sections contract (whitelist, 8192-byte budget, slug, kill-switch,
no-op inside the vault). They do not share a file: the JSON I/O contracts
differ. Vault-MCP deny (`beforeMCPExecution` / `preToolUse`, `failClosed`)
lives next to the Cursor hook, in `hooks/cursor.hooks.json`. Hook commands
are relative to the plugin root, so the file's name does not change them.

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
  (`workflows/*.js`) and `/nerd4rent:` slashes stay Claude Code's runtime.
- Cursor `sessionStart` is fire-and-forget; the inject may arrive after
  the first turn. Skills already know to `Read` the entity page from disk
  when the inject is missing (nerdbrain-wiki lazy-section contract).
- A Cursor marketplace card with `name: nerd4rent` wins over a local
  copy. Local install is a `git clone` straight into
  `~/.cursor/plugins/local/nerd4rent`, not a symlink. Cursor skips symlinks
  that point outside that folder. Uninstall the marketplace card first.
- `~/.claude/hooks/nerdbrain-load.sh` and the Claude Code vault-MCP deny
  in `~/.claude/settings.json` stay outside this repo.
- A skill that needs the platform reads the repo `CLAUDE.md` through
  `adapters/platform.md`; `scripts/validate-platform-references.ts` must
  pass before a release. How the global `~/.claude/CLAUDE.md` rules reach
  Cursor is open (DEMO-368).
