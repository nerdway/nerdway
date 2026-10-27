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
7. **Line endings are LF** — `.gitattributes` (`* text=auto eol=lf`) enforces
   it and `scripts/line-endings.test.ts` guards it; a file committed with CRLF
   or mixed endings is a violation.
8. **No calls to another plugin's skills** — a tracked file never contains
   the invocation form `<plugin>:<skill>` with `superpowers` or
   `mattpocock-skills` as the plugin; `scripts/validate-external-references.ts`
   guards it, with the exempt paths listed in ADR-0009. Naming the plugin or
   its author in prose is allowed.
9. **README is for humans** — `README.md` holds only what a developer needs to
   install and run the plugin: what it is, requirements, installation, first
   steps and links into `docs/`. A README diff that adds workflow topology,
   agent rosters, contract or validator detail, or a per-skill reference is a
   violation; that content goes to `docs/` (contributors) or to `CONTEXT.md`
   and the skills (agents). Documentation for humans (`README.md` and the
   files directly in `docs/`) follows `nerd-documentation-write`, whatever
   style the surrounding text uses; an em dash there is a violation, guarded
   by `scripts/validate-human-docs.ts`.

## Language

**Vault**:
The nerdbrain Obsidian vault, present on every machine where wiki skills
run and propagated between them by Obsidian Sync.
_Avoid_: notes folder, Obsidian database

**Entity page**:
One English-only markdown page per project at
`5-wiki/entities/projects/<slug>.md` inside the vault; the authoritative
project context injected at session start.
_Avoid_: project note, wiki page (ambiguous)

**Tier**:
The vault-availability signal: `file` (vault directory present, access
through the filesystem), `mcp` (directory absent, the vault reachable only
through a configured MCP server, as in a Claude Code cloud session) or `none`
(neither). The plugin's SessionStart hook probes `file` and `none`; `mcp` is
found by the vault skills' own probe (`ToolSearch` for the connector tools
when the directory is absent), because the hook runs in a cloud session too
but sees no connector tools, so there it injects only a hint pointing at that
probe. The tier selects
the vault adapter, `adapters/vault/<tier>.md`. The historical REST/CLI tiers
are dropped.
_Avoid_: mode, level

**Heading path**:
The address of one section of a vault page on the `mcp` tier: the text of the
page's H1, `::`, the section heading text, as in
`nerdbrain-claude-plugin::Decisions`. The root is the H1 text as the document
map lists it, not the slug. Reads and patches through the connector always
target a heading path, never a whole page.
_Avoid_: section path, anchor

**Wiki write**:
One logical wiki mutation — page edit plus index/log upkeep — written
straight to the vault filesystem; propagation between machines is outside
the term.
_Avoid_: page save (hides the index/log half)

**Graph read**:
On-demand discovery of related vault notes via `[[links]]`, backlinks, and
phrase search, executed with `rg` over the vault files.
_Avoid_: obsidian search (names the dropped tool)

**Issue lifecycle axis**:
The path an issue travels from `issue-writer` through
`issue-workflow` and `nerd-personal-docs` to `issue-close`, branching to
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

**Spec**:
The issue description on the tracker: WHAT and WHY, in the sections of the
`IssueSpec` schema, with acceptance criteria that each name their check. The
tracker carries it (ADR-0008); the repository never holds a spec or plan file.
For a complex issue the planner refines it to the full variant before the plan,
writing it only after the user accepts it in chat.
_Avoid_: PRD, spec file, requirements doc (all imply a file in the repo)

**Spec change**:
A change to the spec after work has started: the description is updated after
the user accepts it in chat, and an issue comment opening with `## Spec change`
records what changed and why. These comments are the spec's history.
_Avoid_: spec edit (an edit alone loses the reason)

**Affected files**:
The section of the plan listing every file or directory the implementation will
change. Changing anything else needs the user's yes in chat (frozen rule
`no-change-outside-plan`), after which a comment extends the plan.
_Avoid_: touched files (says what happened, not what was agreed)

**Test approach**:
The section of the plan that sets how the implementation is driven: `TDD`
(the default, run by `nerd4rent:tdd`) or `no tests`, which needs a reason and
the runnable check standing in for a test. Approved with the plan; the mode and
any reason are carried into the session summary. A recommendation, not a frozen
rule.
_Avoid_: implementation mode (the old menu of external skills)

**Seam**:
A public boundary a test is written against — an exported function, a CLI, a
contract file. The plan's test approach lists the seams, so implementation does
not stop to agree them.
_Avoid_: unit (says nothing about where the boundary is)

**Criteria verification**:
The table filled before the move to review: one row per acceptance criterion
with its check, `pass` or `fail`, and the evidence. A `fail` blocks review; the
table goes into the session summary.
_Avoid_: test results (covers only the tests, not every criterion)

**Opis gotowości**:
The readiness description: the PR/MR description rewritten for a human
reviewer once the Criteria verification table is complete — why, what
changed, scope, the criteria table as evidence and the merge risk. Written on
the session model in `issue-workflow` step 6b (and through it in stage 4 of
`auto-issue-mode`); it ends with the marker `<!-- nerd4rent:pr-body -->`, and
only a start draft or a description with that marker is overwritten.
`issue-close` stops while the description is still the start draft.
_Avoid_: PR summary (the one paragraph of the start draft), changelog

**Workflow island**:
A stretch of the axis wide enough, independent enough and free enough of human
input to run as one `Workflow` script. Islands sit inside a conversational
backbone; the axis as a whole is never one graph.
_Avoid_: the graph, parallel phase

**Island host**:
The client machinery that realises an island: the `Workflow` tool running a
`workflows/*.js` script (Claude Code), or the main agent orchestrating `Task`
subagents over the same island agents plus `node scripts/island-reduce.ts` as
the reducer (Cursor). One topology, two hosts — the payloads and stats are
identical by construction.
_Avoid_: runtime backend, executor (both suggest more than one topology)

**Gate**:
A point where progress waits on something outside the agent. `decision` gates
carry a human choice and can only sit between islands, never inside one;
`deny` gates are hard refusals that never ask. Each kind draws its mechanism
from a closed vocabulary the validator enforces: decision — `tracker-status`,
`chat-approval`; deny — `pretooluse-hook`, `settings-deny`. A new enforcement
mechanism is an architecture change and must change the contract deliberately.
_Avoid_: confirmation (blurs decision and deny); checkpoint (a recorded
project state, not a stop — see **Checkpoint**)

**Checkpoint**:
One dated bullet under `## Checkpoints` on a project's entity page — issue ID,
workflow phase on the tracker, branch, short HEAD hash, next step — written by
the session-summary step, by `auto-issue-mode`'s Nerdbrain stage after the
merge, and by `project-continue`, which records the first one unasked when the
section is empty and a new one on drift only with the user's consent. It is
read back by `project-continue`, which verifies it against git and the tracker
and reports any drift. Newest first,
capped at 10; a record of where the project stands, never a point where the
agent waits.
_Avoid_: gate, milestone (both name a stop; a checkpoint stops nothing)

**Grill state**:
The block headed `## Grill state` that `nerd4rent:grill` writes after every
answer of a grilling session: topic, size, the decisions resolved, the facts
checked, the open branches and the next question with its options, closed by
`Confirmed shared understanding: yes` or `no`. Its carrier is a comment on the
issue when one exists (`issue: <ID>`), and chat then gets one summary line;
without an issue (`issue: none`) chat gets that line plus a compact
Resolved/Next note, and the full block only on request, at the end, or as a
paste-resume source. A session resumes from the newest block plus, when an
issue is bound, the Grill decisions checklist. It never opens
with `Status:`, so the `comment` status strategy cannot read it as a phase.
_Avoid_: checkpoint, grill checkpoint (a **Checkpoint** records where the
project stands on the entity page; this records where one interview stands)

**Grill decisions**:
The living markdown checklist headed `## Grill decisions` that `nerd4rent:grill`
upserts on a bound tracker issue after every answer (`- [x] <label> — <choice>`
settled, `- [ ]` deferred or open). One comment or description section,
updated in place. On resume, tracker edits are the source of truth over chat
and over an older Grill state block.
_Avoid_: grill checklist (the heading is the name)

**Platform config**:
The project's tracker (`linear`, `github`, `gitlab`, `ado`, `none`) and VCS
host (`github`, `gitlab`, `ado`) plus the identifiers each needs — schema
`PlatformConfig`. Lives as the `## Platform` section of the repo `CLAUDE.md`,
mirrored as `platform:` on the entity page, and is established by
`determine-platform`; a legacy `linear:` block on an entity page is read as its
alias. An optional `statuses` block binds the canonical phases to the tracker.
Skills read it from disk through `adapters/platform.md`, never from a
`CLAUDE.md` in context.
_Avoid_: platform settings, integration (both hide that it is one YAML object in two places)

**Adapter**:
One markdown file per value per axis — `adapters/trackers/<name>.md`,
`adapters/vcs/<name>.md` or `adapters/vault/<tier>.md` — holding that
platform's or transport's recipes under the sections its axis requires. The
tracker and VCS axes are selected by the platform config, the vault axis by
the tier; read by core skills through `${CLAUDE_PLUGIN_ROOT}`, and by island
agents through the absolute path the calling skill passes in
`args.platform.adapters` (`tracker`, `vcs`, `vault`). A missing adapter stops
the skill and becomes a gap in an island; it never falls back to another
platform or transport.
_Avoid_: driver, plugin (both suggest executable code)

**Operation ID**:
The stable name of one platform action — `issue.set-status`, `pr.merge` — as
declared in the `adapters` block of `workflow-graph.json` and listed in the
first column of every adapter's `## Operations` table. Skills, workflow
islands and their agents name the ID, never the command; `—` as the command marks an action the platform does not
offer.
_Avoid_: command, verb (a command is what the adapter maps the ID to)

**Canonical phase**:
One of the five tracker-independent stages core skills dispatch on —
`backlog`, `todo`, `in-progress`, `in-review`, `done`. A skill never compares
a tracker's own state name; it reads the phase through the status strategy.
Only the human moves an issue to `in-progress`.
_Avoid_: status, state (both name what the tracker shows, not the phase)

**Active issue**:
An issue on the board: canonical phase `todo`, `in-progress` or `in-review`.
What `issue.list-active` returns; the list every consumer read before
`issue.list-open` existed, and so was blind to the Backlog.
_Avoid_: open issue (wider: it includes the Backlog)

**Result split**:
A topic divided into parts of one deliverable: a parent issue with children,
created with `issue.create-child`, where the parent closes once every child
is done. Proposed by `issue-writer` and `grill` when the parts only make
sense together.
_Avoid_: epic split, sub-tasks (both blur it with stages in time)

**Stages in time**:
A topic divided into deliverables that ship one after another: sibling
issues under a shared epic (or top-level), each stage after the first
blocked by the one before through `issue.add-blocked-by`. A stage is never a
child of the previous stage, since closing a parent can close its children.
Stage 2 must ship on its own as a distinct deliverable — never "implement
what stage 1 decided". Research, grill and implementation of one decision
stay on one issue; that sequence is not stages in time.
_Avoid_: phases (the canonical phases are something else), child stages,
research-then-impl split

**Open issue**:
An issue in any mapped canonical phase but `done`: `backlog`, `todo`,
`in-progress` or `in-review`. What `issue.list-open` returns and what every
"what next" answer (`project-continue`, the checkpoint `next` line, the
`done` row of `issue-next-step`) reads, so the Backlog is never reported as
"nothing to do". A state the status map does not hold is phase unknown, not
open.
_Avoid_: active issue (narrower: the board only), backlog item (one phase of
four)

**Status strategy**:
How a tracker shows a canonical phase: `native` (its own state field),
`label` (one label per phase plus open/closed), or `comment` (the newest
comment whose first line is `Status: <value>`). Chosen per project in the
platform config's `statuses` block, else the tracker adapter's default;
each adapter lists its recipe per strategy in `## Status strategies`, and
the shared meaning lives in `adapters/statuses.md`.
_Avoid_: status mode, status backend

**Status map**:
The flat phase → value object under `statuses.map`: state names for
`native`, label names or the reserved `open`/`closed` for `label`, marker
values for `comment`. All five phases are mapped and no value twice, so a
value read back from the tracker names exactly one phase; a value the map does
not hold is "phase unknown", never a guess. Written by `bind-statuses`.
_Avoid_: status mapping table, state aliases

**Done issue without a trace of work**:
An issue in phase `done`, not a parent, with no commit on the default branch
in the forms the workflow writes (the PR/MR title, the start commit,
`Fixes <ID>`, the branch's merge) and no `## No code in this repo` comment
giving a reason. A process bug: the skill that finds it warns and proposes a
bug through `issue-writer`, related to the issue; never a comment alone,
never a phase change. Defined once in `adapters/statuses.md`.
_Avoid_: stale issue, false done (both suggest moving the issue back)

**Exemption**:
A validated exception on a frozen rule: the node allowed to act despite it,
the narrow scope it may touch, and the reason. Four exist today, all on
`no-repo-change-before-in-progress`: `platform-determine` replaces the
`## Platform` section of `CLAUDE.md` and `statuses-bind` writes its
`statuses` key, both before any issue is In Progress; `auto-issue-mode` sets
In Progress itself for the one issue it runs, invoking the skill being the
user's consent; `issue-next-step` sets In Progress for the one issue it
diagnosed, only after the user agrees in chat, and changes nothing in the
repo itself.
_Avoid_: override, bypass (both imply the rule stops holding)

**Frozen rule**:
An invariant enforced mechanically rather than by prose — no tracker write
before approval, no merge without a green check, no repo change before In
Progress. A first-class registry (`frozenRules`) in the contract:
carried by a deny gate, or made unreachable without a human by a decision
gate when the rule is stateful (approval, green verification) and a stateless
deny cannot check it. A registry entry no gate points to is a contract error.
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
each mapped by its own agent in the review island from its own instructions
and rule source. All four always run; the review request carries only the
change range, never an axis list or an external review skill to drive one.
_Avoid_: dimension, reviewer (a reviewer is who runs an axis, not the axis),
engine (the removed notion of an external skill driving an axis)

**Rejection rule**:
The adversarial verification threshold: 3 independent sceptics each try to
refute a finding, and 2 or more refutations out of 3 reject it. A finding
with fewer than 2 cast votes is dropped as unverified and counted — it never
passes because verification failed. A finding decided on 2 of 3 cast votes,
verified or rejected, adds an entry to `gaps`, and a verified one is capped
at `medium` confidence.
_Avoid_: majority vote (hides that the sceptics' goal is to refute), veto

**Axis conflict**:
Two or more verified findings from different review axes on the same
`file:line` anchor, detected by the reducer in plain code. Deduplication keeps
the most severe finding per anchor only within one axis, so a collision across
axes survives to verification instead of silently losing one side. Findings on
neighbouring lines are not a conflict: the criterion is the exact anchor, by
design, so detection stays deterministic and free of an arbitrary window.
_Avoid_: contradiction (the reducer cannot tell whether the findings disagree;
only the judge can), duplicate

**Review judge**:
The `review-judge` agent called once per axis conflict, and never when a
review has none. It answers which axis prevails, or `both` when the findings
are compatible; the reducer then moves each overruled finding verbatim into
`ReviewFindings.conflicts` and counts it in `stats.overruled`. A missing or
invalid verdict keeps every finding and adds a gap — a conflict is never
resolved silently. A `security` finding is never overruled: when `security`
is in the conflict, only `security` or `both` is a valid verdict, and any
other one is treated as invalid by the reducer, not by the judge's prompt.
_Avoid_: arbiter, tie-breaker (it does not break vote ties between sceptics)

**Rejection rate**:
`rejected / (verified + overruled + rejected)` from `ReviewFindings.stats`
(an overruled finding passed verification; the judge set it aside later), read over the
last ~5 review runs — a single run capped at 12 findings has a granularity of
roughly 8%, too coarse to judge. Below **10%** the verifier is decoration:
the sceptics refute nothing, so the stage buys latency instead of signal.
Above **50%** the reviewers are ill-defined: most of what the axis mappers
raise is noise. Between the two is the healthy band. The thresholds are an
initial calibration; revising them is an edit here, never a contract change.
_Avoid_: false-positive rate (claims a ground truth the verification has not)

**Passive metric**:
A figure counted from what a run already emitted, stored only where that run's
result already lands — a Linear comment. The repo has no telemetry and its CI
runs validators only, so a metric that needs a new collection channel, a log
file or a clock is not measured at all: it is rejected, not deferred.
_Avoid_: telemetry, instrumentation (both imply a channel this repo does not have)

**Cursor Plugin**:
The Cursor-native packaging at `.cursor-plugin/plugin.json`, which points at
the existing `skills/` and `agents/` trees and at `hooks/cursor.hooks.json`.
Distinct from Claude Code's `.claude-plugin/`. The repo ships no root
`plugin.json` (Agent Plugins): Claude Code reads that path as a fallback
manifest, so it stays empty (ADR 0007, DEMO-364).
_Avoid_: Cursor extension, marketplace plugin (a marketplace card is how
Cursor *pins* a plugin, not the packaging); bare plugin.json (ambiguous —
the Claude Code and Cursor manifests both carry that filename)
