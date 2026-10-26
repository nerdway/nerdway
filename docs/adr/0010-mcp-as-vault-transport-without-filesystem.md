# MCP as the vault transport where the vault filesystem is absent

*Amended by DEMO-455: the plugin's SessionStart hook now runs in Claude Code as well, cloud sessions included. It still sees no connector tools, so without the vault directory it injects tier `none` with a hint naming the `mcp` probe and `page.read-section`; the tier itself is still set by the skill's probe.*

*Amended by DEMO-454: the `mcp` tier is operational through `adapters/vault/mcp.md`. The skill's own probe finds it, not a SessionStart hook, because a cloud session runs no hook: the vault directory exists → `file`; otherwise `ToolSearch` for a `mcp__claude_ai_nerdbrain__*` tool → `mcp`, none → `none`. On `mcp` a page is read section by section through its heading path (`<H1>::<Section>`, root taken from the document map), never as a whole, since one untargeted read of an entity page cost 37.4k tokens; every patch carries the full heading path. The graph operations are unsupported on that tier and a recall degrades with an annotation instead of failing.*

ADR-0001 made the filesystem the only path to the nerdbrain vault: every
skill reads it with `Read` and `rg` and writes it with `Edit` and `Write`,
and the Obsidian MCP server and the Obsidian Local REST API (port 27124)
were prohibited outright. The prohibition lived in four places: the frozen
rule `vault-filesystem-only` in `workflow-graph.json` with its `settings-deny`
gates on the `wiki-write` and `personal-docs` nodes, the Cursor hook
`hooks/deny-vault-mcp.ts` on `beforeMCPExecution` and `preToolUse`, the
boundary sentences of several skills, and, outside this repo, the deny rules
and the hard rules of `~/.claude`. The rule had two justifications, and both
have expired. "An MCP server bloats the context" was true when every tool
schema was loaded at session start; Claude Code now loads MCP tool schemas
lazily through `ToolSearch`, so an unused server costs one tool name.
"The filesystem is on every machine" was true for desktops and headless
servers, the two hosts ADR-0001 considered; a Claude Code cloud session has
neither Obsidian nor the vault files, and ADR-0004 rules out git as a channel,
so the only road from such a session to the vault is a remote MCP server in
front of an Obsidian instance on a VPS (Obsidian plus the Local REST API,
propagation by Obsidian Sync as before). ADR-0001 did not foresee that host.

**The filesystem stays the default vault path wherever the vault directory
exists; where it does not, an MCP server in front of Obsidian is an allowed
transport.** The plugin no longer forbids the Obsidian MCP server, the Linear
MCP server or the Local REST API anywhere. Lifting the ban is not the same as
using it: locally nothing changes, `nerdbrain-wiki` and `nerdbrain-search`
still know only the `file` and `none` tiers, and the `mcp` tier they will
need is a later stage (after a spike; the connector and the cloud session are
DEMO-451). Linear stays on `linearis`: the mechanical skills pinned to Haiku
(`issue-start`, `issue-close`) need a deterministic CLI with stable output,
which an MCP tool does not promise, so the Linear MCP server is merely
unblocked and no skill uses it. ADR-0004 is untouched: propagation is
Obsidian Sync, and no git command is ever run against the vault.

## Considered Options

- **Keep the ban** — rejected: it leaves the cloud session without any path
  to the vault, and its context-cost rationale no longer holds. A frozen rule
  whose only effect is to lock out a legitimate host is not an invariant.
- **MCP everywhere, filesystem dropped** — rejected: the filesystem recipe is
  one `Read`/`Edit`/`Write`/`rg` sequence with no server, no token and no
  network, and ADR-0001's reason for a single recipe on every local machine
  stands. Trading it for a remote server on hosts that have the files would
  add a dependency for no functional gain.
- **MCP only where the vault filesystem is absent** — chosen: the default
  stays what it is, and the new transport covers exactly the host ADR-0001
  missed. The tier probe decides which path applies, so a skill never
  chooses between them on its own.

## Consequences

- `workflow-graph.json` loses the frozen rule `vault-filesystem-only` and
  the two `settings-deny` gates that enforced it on `wiki-write` and
  `personal-docs`. Rule 22 of the contract rejects a rule no gate points to
  and rule 20 a gate pointing at no rule, so both go in one change.
- `wiki-write` and `personal-docs` are no longer marked `irreversible: true`.
  The flag existed to hold the transport gate (rule 6 requires a gate behind
  every irreversible node). A vault write is an edit of markdown files that
  the next edit reverses, and Obsidian (File Recovery) and Obsidian Sync
  (version history) keep the previous versions; a `decision` gate would be
  false, because both skills write without asking, and a `deny` gate on the
  git prohibition would be false too, because ADR-0004 keeps that
  prohibition as prose on purpose. The inventory of irreversible actions
  drops from seven to five: `statuses-bind`, `issue-write`, `implement`,
  `close`, `auto-issue-mode`.
- The Cursor hook `hooks/deny-vault-mcp.ts` and its test are deleted, and
  `hooks/cursor.hooks.json` no longer registers `beforeMCPExecution` or
  `preToolUse`. The remaining Cursor hooks are the session-start inject, the
  install check and the issue reminder and gate.
- The **Tier** term in `CONTEXT.md` gains the value `mcp`: the vault
  directory is absent and a configured MCP server reaches the vault. The
  SessionStart probes (`~/.claude/hooks/nerdbrain-load.sh`, and
  `hooks/session-start.ts` for Cursor) still return `file` or `none`; the
  `mcp` value becomes operational together with the vault skills' `mcp`
  tier.
- The boundary sentences of `bind-statuses`, `determine-platform`,
  `project-continue` and `nerd-personal-docs` say what this ADR says: the
  filesystem by default, MCP where the vault filesystem is absent, never
  git against the vault.
- The deny rules `mcp__obsidian`, `mcp__linear` and the `curl` rules for
  port 27124 in `~/.claude/settings.json`, the "Never use a Linear or
  Obsidian MCP" hard rule in `~/.claude/CLAUDE.md` and the tier probe in
  `~/.claude/hooks/nerdbrain-load.sh` are the user's own configuration,
  outside this repository, and change by hand after this lands.
- ADR-0001 is amended: its MCP/REST prohibition no longer applies; the
  filesystem recipe it describes stays the local default. ADR-0004 is
  amended: the frozen rule and gates it names as the mechanically enforced
  half of the vault policy are gone, and the git prohibition stands alone as
  prose, as it already did.
