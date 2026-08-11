# nerd4rent-claude-plugin

Claude Code plugin bundling the skills that run the Nerd4Rent daily developer
workflow: Linear issue lifecycle and the nerdbrain second-brain wiki.

## Language

**Vault**:
The nerdbrain Obsidian vault — a git checkout of `pawelwlazlo/nerdbrain`
present on every machine where wiki skills run.
_Avoid_: notes folder, Obsidian database

**Entity page**:
One English-only markdown page per project at
`5-wiki/entities/projects/<slug>.md` inside the vault; the authoritative
project context injected at session start.
_Avoid_: project note, wiki page (ambiguous)

**Tier**:
The vault-availability signal probed by the SessionStart hook. Reduced to
`file` (vault directory present) or `none` (absent); the historical
REST/CLI tiers are dropped.
_Avoid_: mode, level

**Wiki write**:
One logical wiki mutation — page edit plus index/log upkeep — always
concluded by a git commit and push of the vault.
_Avoid_: page save (hides the git half)

**Graph read**:
On-demand discovery of related vault notes via `[[links]]`, backlinks, and
phrase search, executed with `rg` over the vault files.
_Avoid_: obsidian search (names the dropped tool)

**Issue lifecycle axis**:
The path an issue travels from `linear-issue-writer` through
`linear-issue-workflow` and `linear-issue-close` to `nerdbrain-wiki`, declared
as a whole in `workflow-graph.json`.
_Avoid_: pipeline, the flow (both hide that parts of it are not sequential)

**Node**:
One step of the axis, owned by exactly one skill and declaring its runtime
(`conversational`, `workflow`, `chain`), failure policy, budget and gates.
_Avoid_: step, stage (say nothing about who runs it)

**Edge**:
A dependency between two nodes that carries a **named schema** — the payload
the upstream node produces and the downstream node consumes. An edge with no
schema on both ends is a contract error, not a loose coupling.
_Avoid_: handoff, "pairs with" (status, not data)

**Workflow island**:
A stretch of the axis wide enough, independent enough and free enough of human
input to run as one `Workflow` script. Islands sit inside a conversational
backbone; the axis as a whole is never one graph.
_Avoid_: the graph, parallel phase

**Gate**:
A point where progress waits on something outside the agent. `decision` gates
carry a human choice (the Linear status, an approval in chat) and can only sit
between islands, never inside one; `deny` gates are hard refusals enforced by a
`PreToolUse` hook.
_Avoid_: checkpoint, confirmation (blur decision and deny)

**Frozen rule**:
An invariant enforced mechanically rather than by prose — no Linear write
before approval, no merge without a green check, no vault access outside
filesystem/`rg`. Carried by `deny` gates.
_Avoid_: guideline, convention (both imply it may be skipped)
