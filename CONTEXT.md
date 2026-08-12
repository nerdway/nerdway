# nerd4rent-claude-plugin

Claude Code plugin bundling the skills that run the Nerd4Rent daily developer
workflow: Linear issue lifecycle and the nerdbrain second-brain wiki.

## Standards

The repo's coding standards, phrased so each one is checkable against a diff
alone. The `repo-standards` review axis cites this section as its rule source;
a rule that cannot be verified from the diff does not belong here.

1. **No code comments**, except to state a constraint the code itself cannot
   express. A comment explaining what the next line does, where code came
   from, or why a change is correct is a violation.
2. **Repo content is English-only** (docs, code, skill bodies); **commit
   messages are Polish**, starting with a declarative noun form
   (e.g. `Dodanie`, `Poprawa`).
3. **Commits are atomic** — one logical change per commit; a commit mixing
   unrelated concerns is a violation.
4. **Generated templates are never hand-edited** — `plan-template.md`,
   `issue-template.md`, `session-summary-template.md` change only by editing
   the schema body in `workflow-graph.json` and re-running
   `node scripts/render-templates.ts`.
5. **Inline workflow schemas follow the drift-check convention** — a contract
   schema in a `workflows/*.js` script is declared as `const SCHEMA_<Name> =`
   holding a strict-JSON literal, verbatim deep-equal to the registry body;
   intermediate shapes must NOT use the `SCHEMA_` prefix.
6. **Changes are surgical** — every changed line traces to the issue being
   implemented; refactoring or improving adjacent code it did not need to
   touch is a violation.

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
`linear-issue-workflow` to `linear-issue-close`, branching to
`nerdbrain-search` in the plan phase and to `nerdbrain-wiki` off the
implement phase. Declared as a whole in `workflow-graph.json`.
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

**Schema body**:
The JSON Schema literal every registry entry in `workflow-graph.json` carries.
One definition with two consumers: `agent({schema})` enforces it inside a
workflow island, and the renderer builds the skill templates from its `title`
and `description` fields.
_Avoid_: schema name, type (both survive from when the registry held only ids)

**Self-contained schema**:
A schema body whose `$ref`s point only into its own `$defs`, so a workflow
script can inline it verbatim. A reference reaching another registry entry
would dangle the moment the literal is copied into a script, which is why the
validator rejects it.
_Avoid_: standalone, complete (say nothing about references)

**Generated template**:
A skill template file rendered from a schema body rather than written by hand —
`plan-template.md`, `issue-template.md`, `session-summary-template.md`. Rebuild
with `node scripts/render-templates.ts`; a hand edit reddens the drift test.
_Avoid_: example, boilerplate (both imply it may be edited in place)

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

**Gatherer**:
One concurrent `agent()` inside a workflow island that reads a single
independent context source (repo layout, ADRs, prior plans, Linear relations,
the vault) and returns a typed partial result. Gatherer count stays within the
node's `budget.maxWidth` declared in the contract, never picked ad hoc.
_Avoid_: subtask, worker (say nothing about the one-source-per-agent split)

**Reducer**:
The plain-code join at the end of an island — deduplication, dropping empty
results, trimming to the recall limits — deterministic by construction (no
agent, no clock, no randomness), so the same gatherer output always reduces to
the same context.
_Avoid_: merge agent, synthesizer (both imply a model does the joining)

**Script binding**:
The `script` field on a workflow node naming the `workflows/*.js` file that
realises its island; two sibling nodes may share one script. The binding is
what arms the drift check in the omission direction: every `out` schema of a
bound node must be inlined in that script (rule 17), verbatim (rule 18). A
workflow node without a binding is an island not yet built.
_Avoid_: implementation pointer, link (both hide the drift-check role)

**Review axis**:
One of the four fixed, mutually independent review dimensions —
`spec-compliance`, `repo-standards`, `correctness-regressions`, `security` —
each mapped by its own agent in the review island. An axis whose engine is
missing degrades to plain-agent; it is never removed.
_Avoid_: dimension, reviewer (a reviewer is who runs an axis, not the axis)

**Engine**:
The review path driving one axis — e.g. `superpowers`, `matt-pocock`,
`code-review`, `plain-agent` — detected per session in `review-menu`,
because only the main agent sees the session's skill list. A free string in
the contract (a new engine never forces a contract bump; the island degrades
unknown values to plain-agent) and a prompt hint for the axis mapper, never
a hard invocation.
_Avoid_: reviewer, tool (both suggest the island calls it directly)

**Rejection rule**:
The adversarial verification threshold: 3 independent sceptics each try to
refute a finding, and 2 or more refutations out of 3 reject it. A finding
with fewer than 2 cast votes is dropped as unverified and counted — it never
passes because verification failed.
_Avoid_: majority vote (hides that the sceptics' goal is to refute), veto
