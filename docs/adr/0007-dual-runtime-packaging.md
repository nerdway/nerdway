# Dual-runtime packaging and a Cursor-native SessionStart

The plugin must load as a native plugin in Cursor (skills, agents, hooks)
without changing Claude Code behaviour and without making `npx skills add`
the only Cursor path. Cursor and Claude Code speak different manifest and
hook JSON contracts; one shared `nerdbrain-load.sh` cannot emit both.

We keep **three manifests, one `skills/` and one `agents/`**:

| Runtime | Manifest | Loads |
|---------|----------|-------|
| Claude Code | `.claude-plugin/plugin.json` + `marketplace.json` | skills, agents, `workflows/*.js` islands, `/nerd4rent:` slashes |
| Agent Plugins / other clients | root `plugin.json` (`$schema` 1.0.0, closed fields) | skills discovered from `skills/` |
| Cursor | `.cursor-plugin/plugin.json` | `skills/`, `agents/`, `hooks/` |

Root `plugin.json` takes no field outside the Agent Plugins 1.0.0 schema
(`name`, `version`, `description`, `author`, `homepage`, `repository`,
`license`, `keywords`, `extensions`). Skills are not a manifest field —
clients discover `skills/`. `.cursor-plugin/plugin.json` names
`name: nerd4rent` and explicit `./skills/`, `./agents/`,
`./hooks/hooks.json` paths (an explicit field *replaces* auto-discovery).
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
lives next to the Cursor hook.

`npx skills add` remains the fallback for agents without a native plugin
loader. Agent frontmatter keeps Claude Code keys (`tools:`, `model:`
aliases, `skills:` on the gatherer) and adds `readonly: true`; Cursor
model IDs are not substituted in.

## Considered Options

- **Agent Plugins only (skills, no Cursor Plugin)** — rejected: SessionStart
  and agents are acceptance criteria; Agent Plugins 1.0.0 does not load
  Cursor hooks or `agents/`.
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
- **No `.cursor-plugin/marketplace.json`** — reversed (DEMO-345): the file does
  not unstick a personal `/add-plugin` pin. But Cursor documents it as required
  for GitHub imports, and a team marketplace imported from the repo with
  Auto Refresh follows `main`. That is the only path that stays current.

## Consequences

- Four version strings move in lockstep:
  `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
  (`metadata.version`), root `plugin.json`, `.cursor-plugin/plugin.json`.
  `scripts/validate-manifests.ts` checks the four and the two closed
  schemas; drift exits non-zero.
- `.claude-plugin/` is edited only for that lockstep version. Islands
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
