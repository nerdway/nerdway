# Research: spec-driven development patterns

Checked on 2026-10-06.

*Amended 2026-10-06 by ADR-0008: the spec and the plan live on the tracker, not
in the repository. The issue description is the spec, the `## Implementation
plan` comment is the plan, and the repository holds code only. The rows and
sections below that placed the spec and the plan in files are updated and
marked.*

*Amended 2026-10-07: three other projects, read only superficially, were
dropped as sources. The decisions that cited them keep their
verdict and reason, and now cite pstack, superpowers or Matt Pocock where those
have the same pattern, or "own decision" where none does. The skills the plugin
actually borrows, superpowers and Matt Pocock's, are read in full in their own
section, with one decision per practice.*

## Why this document exists

The plugin covers the issue lifecycle (issue, plan, implement, review, close),
but the practices around it are borrowed: TDD, debugging, subagent dispatch,
code review and grilling come from `superpowers:*` and `mattpocock-skills:*`,
and nothing leads from requirements to a specification that steers the plan.
The goal of the follow-up work is a plugin that carries the whole path on its
own. Before writing any skill, this document reads an existing agent-workflow
system, pstack, and the two skill libraries the plugin borrows from today,
superpowers and Matt Pocock's skills. It decides pattern by pattern what to
adopt and what to reject, decides per practice whether the plugin writes its
own skill, and ends with the target architecture the next stages build.

The sources are read for patterns, not for text. Nothing here is copied, and
the skills we write are written from scratch.

## How the sources were read

This section and the next two describe pstack. superpowers and Matt Pocock
were read differently, in full, and their sources and reading method are in
their own section below.

The repository was inspected through the GitHub API on the date above: file
tree, licence, the skills and agents most relevant to the seven categories
below, and the opening of each file (frontmatter and the first sections). The
files were not read end to end. A category marked "none found" means no skill,
agent or playbook for it appeared in the tree or in the descriptions; it is not
a claim that the project never does it.

## Sources

| Source | Link | Checked | Revision | Licence |
|---|---|---|---|---|
| pstack (upstream, Cursor plugin by Lauren Tan) | https://github.com/cursor/plugins/tree/main/pstack | 2026-10-06 | `df581122c` | MIT (`pstack/LICENSE`) |
| pstack-claude (Claude Code port of pstack, by lifeofladi) | https://github.com/lifeofladi/pstack-claude | 2026-10-06 | `de39d5ba0` | MIT |

Notes on identification:

- `poteto/pstack` as a repository does not exist (it returns 404). The
  upstream lives at `cursor/plugins`, directory `pstack`. The Claude Code port
  was read for the skill bodies because it carries the same skills with the
  primitives translated.
- Both licences are MIT, which permits reading and reuse. Because the
  decision is to adopt patterns and write the skills ourselves, no licence
  obligation (attribution, notice file) arises from this work. The ADR that
  adopts an idea still credits where it came from.

## What each source is

- **pstack** is a large agent-workflow system: a router mode, about two dozen
  playbooks (bug fix, feature, refactor, multi-phase plan, shipping), around
  twenty engineering principles as separate skills, and fan-out primitives
  (`swarm`, `arena`, `interrogate`). It has no specification layer; the plan is
  the deliverable and is checked by a script. Its strength is discipline about
  evidence: nothing is called done until it was observed running.

## Patterns by category

### Spec

| Source | Pattern |
|---|---|
| pstack | No spec layer. A multi-phase plan with a fixed skeleton is the highest artifact; a script validates its shape. |

### Planning

| Source | Pattern |
|---|---|
| pstack | The plan is a checklist the operator audits from evidence. Each PR is one change with its own verification block (unit, live, performance). A plan for a one- or two-file change is skipped. |

### TDD

| Source | Pattern |
|---|---|
| pstack | Failing test first for bug fixes only, and only when the test path is cheap; otherwise say why and use the closest executable check. The failing repro lands in history before the fix. |

### Debugging

| Source | Pattern |
|---|---|
| pstack | The bug-fix playbook: reproduce it yourself on the real surface, form hypotheses and eliminate them with runtime evidence (binary search), confirm the mechanism before designing the fix, verify on the same surface, never ship a change that evidence did not justify. |

### Subagent dispatch

| Source | Pattern |
|---|---|
| pstack | `swarm`: frame the done predicate and report shape, fan out in one message with self-contained briefs, aggregate into a compact table with explicit gaps. `arena`: N competing candidates, pick a base, graft. Model and effort per role from a config file. Rule: guard the context window by returning pointers, not dumps. |

### Review

| Source | Pattern |
|---|---|
| pstack | `interrogate`: a panel where every seat has a different lens, model and effort tier, because reviewers running the same prompt agree and miss the same things. The output is a verdict and is never auto-applied. |

### Grilling

| Source | Pattern |
|---|---|
| pstack | No grilling skill found. A rule instead: classify a question before asking it, and when the answer is a fact observable by running something, run a throwaway prototype rather than ask the human. |

## superpowers and Matt Pocock: the skills the plugin borrows

pstack is a project we read from the outside. superpowers and Matt Pocock's
skills are different: they are installed on this machine, the plugin's skills
point at them, and sessions run them. Replacing them without reading them would
mean dropping things that work without knowing it. This section reads both
libraries for the nine practices the plugin borrows and ends with one decision
per practice.

### Sources

| Source | Link | Checked | Revision | Licence |
|---|---|---|---|---|
| superpowers (Jesse Vincent), Claude Code plugin | https://github.com/obra/superpowers | 2026-10-07 | 6.2.0, `3dcbd5c4b` | MIT (`LICENSE`, © 2025 Jesse Vincent) |
| mattpocock-skills (Matt Pocock), Claude Code plugin | https://github.com/mattpocock/skills | 2026-10-07 | 1.2.0, `ed37663cc` | MIT (`LICENSE`, © 2026 Matt Pocock) |
| Matt Pocock's skills installed with `npx skills` into `~/.agents/skills` | https://github.com/mattpocock/skills | 2026-10-07 | per-skill folder hashes in `~/.agents/.skill-lock.json`, updated 2026-07-09 (older skills 2026-05-15) | MIT |

Notes on identification:

- The revisions are the `gitCommitSha` values Claude Code recorded when it
  installed each plugin (`~/.claude/plugins/installed_plugins.json`).
- Matt Pocock's skills exist in two copies. The `~/.agents/skills` copy matches
  plugin 1.2.0 for every skill read here except `grilling` (wording: "plan" and
  "codebase" in place of "this" and "environment") and `to-tickets` (one local
  `tickets.md` in place of one file per ticket). It also still holds `diagnose`,
  `to-issues` and `to-prd`, which 1.2.0 renamed or dropped (`diagnosing-bugs`,
  `to-tickets`, `to-spec`). Both copies were read.
- Which copy a session actually loads matters. In Claude Code the superpowers
  plugin is enabled, but the mattpocock-skills plugin is installed without being
  enabled, and Claude Code does not read `~/.agents/skills`. A Claude Code
  session on this machine therefore sees no Matt Pocock skill at all; the
  `~/.agents/skills` copy serves the other agents that read that directory.

### How these two sources were read

Unlike pstack, both libraries were read **in full** from the installed copies:
every line of each `SKILL.md` below and of the supporting files it links to.

- superpowers: `test-driven-development` (+ `writing-good-tests.md`),
  `systematic-debugging` (+ `root-cause-tracing.md`, `defense-in-depth.md`,
  `condition-based-waiting.md` and its example, `find-polluter.sh`,
  `CREATION-LOG.md` and the four pressure-test scenarios),
  `dispatching-parallel-agents`, `subagent-driven-development` (+
  `implementer-prompt.md`, `task-reviewer-prompt.md`, `re-review-prompt.md` and
  the three scripts), `brainstorming` (+ `spec-document-reviewer-prompt.md`),
  `requesting-code-review` (+ `code-reviewer.md`), `receiving-code-review`,
  `writing-plans` (+ `plan-document-reviewer-prompt.md`), `executing-plans`,
  `verification-before-completion`, `finishing-a-development-branch`.
- Matt Pocock: `tdd` (+ `tests.md`, `mocking.md`), `diagnosing-bugs` and the
  older `diagnose`, `implement`, `grilling`, `grill-me`, `grill-with-docs`,
  `domain-modeling` (+ `ADR-FORMAT.md`, `CONTEXT-FORMAT.md`), `code-review`,
  `to-spec`, `to-tickets`, and the older `to-issues` and `to-prd`.

One exception: the brainstorming *visual companion* (`visual-companion.md`
and the browser server under `scripts/`) was read only far enough to place it.
It serves UI mockups in a browser tab, which no practice here needs.

Skills of either library outside the nine practices (`writing-skills`,
`using-git-worktrees`, `using-superpowers`; `teach`, `prototype`, `triage`,
`wayfinder`, `handoff`, `codebase-design` and the rest) were not analysed.

### Where the plugin uses them

References in the repository (`skills/`, `agents/`, `workflows/`):

| Reference | Where | Role |
|---|---|---|
| `mattpocock-skills:grilling` | `issue-workflow` (grilling session), `issue-writer` (twice) | optional question format; the inline protocol works without it |
| `grill-me` / `grill-with-docs` | `issue-workflow`, `issue-writer`, `new-project-workflow` | named only to forbid delegating to them (`disable-model-invocation: true`), and offered as a manual slash command |
| `mattpocock-skills:code-review`, `superpowers` code-review | `workflows/review-verify.js` engine hints, `issue-workflow` axis table | an engine hint per review axis |
| `superpowers:test-driven-development`, `superpowers:subagent-driven-development` | `issue-workflow` step 5 | implementation modes on offer |
| `superpowers:systematic-debugging` | `nerdbrain-wiki` | an example of a debugging flow worth a wiki write |
| `docs/superpowers/plans/` | `plan-context-fanout`, `issue-workflow` | prior-art path read by the plan island |

Use in sessions, measured from what this machine keeps:

- Claude Code transcripts (`~/.claude/projects/*/*.jsonl`, 125 sessions from
  2026-09-08 to 2026-10-07; Claude Code prunes older ones): the `Skill` tool was
  called with `superpowers:test-driven-development` 3 times. No other skill of
  either library was invoked through the tool in that window.
- Claude Code prompt history (`~/.claude/history.jsonl`, 2026-04-10 to
  2026-10-07): `/grill-me` once, `/grill-with-docs` once,
  `/setup-matt-pocock-skills` once, `/code-review` once (the name is also a
  built-in Claude Code command, so this one may not be Matt Pocock's).
- The repository itself: `docs/superpowers/specs/` and `docs/superpowers/plans/`
  hold two specs and two plans from 2026-08-05 and 2026-08-06, written by
  `brainstorming` and `writing-plans` before the plugin's own planning took over.
- Not covered: Cursor sessions, and Claude Code sessions older than the
  transcript window. superpowers also loads into every Claude Code session on
  its own: its SessionStart hook injects `using-superpowers`, which tells the
  agent to invoke `brainstorming` before any creative work and TDD before any
  code.

### Practice by practice

#### TDD

- **superpowers** (`test-driven-development`): an iron law, "no production
  code without a failing test first"; code written before its test is deleted,
  not kept as reference. Red, verify red, green, verify green, refactor. A table
  of rationalisations and red flags blocks the usual excuses. Exceptions only
  with the human's permission. `writing-good-tests.md` adds "name the break the
  test catches", literal expected values, no change detectors, behaviour not
  text ("documents that instruct agents are tested by the consuming agent's
  behaviour"), mock only the slow or external level, and a mutation check.
- **Matt Pocock** (`tdd`): a reference for tests worth keeping. Tests sit at
  *seams*, public boundaries agreed with the user before any test is written.
  Anti-patterns: implementation-coupled, tautological, horizontal slicing (all
  tests first). One seam, one test, one minimal implementation per cycle.
  Refactoring is not part of the loop; it belongs to review. `mocking.md`: mock
  at system boundaries only.
- **Overlap and difference:** both demand red before green, minimal code,
  behaviour over implementation and independent expected values. They differ on
  refactoring (in the loop for superpowers, out of it for Matt Pocock), on who
  picks what to test (Matt Pocock asks the user; superpowers tests every new
  function), and on strictness (superpowers allows no exit without the human;
  Matt Pocock does not discuss exits).
- **How we use them:** `issue-workflow` offers
  `superpowers:test-driven-development` as an implementation mode; it is the only
  practice skill the transcripts show being invoked (3 times). Our decision of
  2026-10-06 makes TDD the default mode, with a recorded reason to leave it.
- **What works:** verify red as a mandatory step; "name the break";
  tautological tests named as a defect; vertical slices; "behaviour not text",
  which fits a repository of markdown skills where grepping a skill's text
  proves nothing.
- **What gets in the way:** the superpowers iron law ("delete means delete",
  no exit without permission) contradicts our recorded-reason exit and treats a
  documentation-only change as a violation. Matt Pocock's seam confirmation
  puts a human question inside implementation, where `issue-workflow` keeps
  none; in our flow the seams belong in the plan's test approach.

#### Debugging

- **superpowers** (`systematic-debugging`): "no fixes without root cause
  investigation first". Four phases: root cause (read errors, reproduce, recent
  changes, instrument component boundaries, trace data flow backwards), pattern
  analysis against working code, one hypothesis tested with the smallest
  change, then a failing test, one fix and verification. After three failed
  fixes, stop and question the architecture with the human. Supporting files:
  backward root-cause tracing, validation at every layer (defense in depth),
  condition-based waiting instead of sleeps, a script that bisects which test
  pollutes state.
- **Matt Pocock** (`diagnosing-bugs`, older `diagnose`): building a feedback
  loop *is* the skill. Phase 1 ends only with one red-capable, deterministic,
  fast, agent-runnable command that has already been run. Then reproduce and
  minimise until every element is load-bearing, write 3 to 5 ranked falsifiable
  hypotheses and show them to the user (without blocking on the answer),
  instrument one variable at a time with tagged debug logs, write the regression
  test before the fix only at a correct seam ("no correct seam is itself the
  finding"), clean up and state the confirmed hypothesis in the commit.
- **Overlap and difference:** both forbid fixing before understanding and both
  want a failing test before the fix. superpowers anchors on root cause and one
  hypothesis at a time; Matt Pocock anchors on the feedback loop and several
  ranked hypotheses up front, explicitly to avoid anchoring on the first idea.
- **How we use them:** referenced only as an example in `nerdbrain-wiki`; no
  invocation in the transcripts. The adopted method so far comes from pstack.
- **What works:** Matt Pocock's loop-first completion criterion (one command,
  already run, red on this bug); tagged debug logs that a single grep removes;
  the correct-seam rule; the confirmed hypothesis in the commit message. From
  superpowers: the three-failed-fixes breaker and backward tracing.
- **What gets in the way:** superpowers' defense in depth ("validate at every
  layer") collides with our rule against error handling for impossible
  scenarios; its pressure-test framing is long. Matt Pocock's hand-off to
  `/improve-codebase-architecture` points at a skill we do not ship.

#### Subagent dispatch

- **superpowers** (`dispatching-parallel-agents`): one agent per independent
  problem domain, all dispatched in one message; each prompt is focused,
  self-contained and specific about its output; after return, check for
  conflicts, run the full suite, spot-check. Not for related failures or shared
  state. (`subagent-driven-development`): a controller runs a written plan task
  by task with a fresh implementer per task, a task review for spec and quality,
  a fix loop capped at five rounds, a ledger file that survives compaction, an
  explicit model per role, artifacts handed over as files, never parallel
  implementers, and a final whole-branch review.
- **Matt Pocock:** no dispatch skill. `implement` runs `tdd` and `code-review`
  in one agent; `code-review` spawns its two axes as parallel subagents.
- **Overlap and difference:** only superpowers has a practice here. Its two
  skills split the cases the plugin already distinguishes: read-only fan-out
  (our islands) and sequential writers.
- **How we use them:** `issue-workflow` offers
  `superpowers:subagent-driven-development` as an implementation mode; no
  invocation in the transcripts. The islands already fan out with
  self-contained prompts and reduce in code.
- **What works:** the independence test before parallel dispatch; "never trust
  the agent's report, check the diff"; never two writers at once; a hard cap on
  fix rounds; handing artifacts over as files so the controller's context stays
  small.
- **What gets in the way:** `subagent-driven-development` needs a plan file
  and a git-ignored workspace (`.superpowers/sdd/<plan>/`); ADR-0008 keeps the
  plan on the tracker and no plan file in the repository. It also requires a
  worktree and a per-role model choice, both machine- and host-specific.

#### Grilling

- **superpowers** (`brainstorming`): a hard gate before *every* project,
  however simple: explore context, ask one question at a time (multiple choice
  preferred), propose 2 to 3 approaches with a recommendation, present the design
  section by section for approval, write and commit a spec file, self-review it,
  have the user review the file, then hand off to `writing-plans` and nothing
  else.
- **Matt Pocock** (`grilling`): four rules. Interview relentlessly down each
  branch of the decision tree; one question at a time with a recommended answer;
  look facts up in the environment, put decisions to the user; act only after
  the user confirms shared understanding. `grill-me` and `grill-with-docs` are
  user-only wrappers (`disable-model-invocation: true`) around it, the second
  adding `domain-modeling`.
- **Overlap and difference:** both ask one question at a time. superpowers
  converges on a written design and a spec file; Matt Pocock converges on
  shared understanding and writes nothing by itself.
- **How we use them:** the inline grilling protocol in `issue-workflow` is
  Matt Pocock's four rules restated, plus the ADR test from `domain-modeling`;
  `issue-writer` names `mattpocock-skills:grilling` as optional;
  `new-project-workflow` offers `/grill-me` as a manual command. History shows
  `/grill-me` and `/grill-with-docs` once each; in Claude Code the plugin copy is
  not enabled, so the inline protocol is what actually runs.
- **What works:** Matt Pocock's rules are short enough to restate, and the
  recommended answer with every question speeds the session up; the
  fact-versus-decision split.
- **What gets in the way:** `brainstorming` applies to every task regardless of
  size, against our adaptive threshold; it writes spec files, which ADR-0008
  rejects; it hands off to `writing-plans`, competing with `issue-workflow` for
  the plan; and the superpowers SessionStart hook pushes it into every session,
  including this plugin's own issue sessions. The Matt Pocock wrappers cannot be
  called by the model at all.

#### Domain modelling

- **superpowers:** none.
- **Matt Pocock** (`domain-modeling`): the active discipline of changing the
  model while designing: challenge a term against the glossary, sharpen fuzzy
  words into canonical ones, stress relationships with invented scenarios,
  cross-check claims against the code, update `CONTEXT.md` the moment a term is
  resolved, and offer an ADR only when a decision is hard to reverse, surprising
  without context and the result of a real trade-off. `CONTEXT-FORMAT.md`: tight
  definitions with an `_Avoid_` line; `ADR-FORMAT.md`: an ADR can be one
  paragraph.
- **How we use them:** `issue-workflow` names `domain-modeling` as optional and
  already restates its three-condition ADR test and the glossary habit in its
  docs discipline. This repository's `CONTEXT.md` and `docs/adr/` follow the same
  layout.
- **What works:** the three-condition ADR test; capturing terms inline instead
  of reconstructing them later; the `_Avoid_` line, which records the rejected
  synonyms.
- **What gets in the way:** Matt Pocock's `CONTEXT.md` is "a glossary and
  nothing else", while ours opens with `## Standards`, the rule source of the
  `repo-standards` review axis, before its `## Language` glossary. A native
  skill must confine itself to the glossary section.

#### Review

- **superpowers** (`requesting-code-review`): dispatch one reviewer subagent
  with crafted context, never the session history; the reviewer template checks
  plan alignment, quality, architecture, tests and production readiness and
  grades issues Critical, Important or Minor, with a ready-to-merge verdict.
  (`receiving-code-review`): verify each finding against the codebase before
  implementing, clarify every unclear item first, push back with technical
  reasons, check YAGNI by grepping for real usage, no performative agreement.
- **Matt Pocock** (`code-review`): two axes, Standards and Spec, run as
  parallel subagents so they do not contaminate each other. Standards carries a
  fixed baseline of twelve Fowler code smells, always reported as judgement
  calls, which documented repo standards override. The two reports are
  presented side by side and never merged or reranked across axes.
- **Overlap and difference:** both isolate the reviewer's context. superpowers
  runs one generalist reviewer; Matt Pocock separates spec from standards.
  Neither verifies findings adversarially; our island does.
- **How we use them:** both appear only as engine hints for an axis in
  `review-verify`; the four axes, the reducer and the sceptic votes are already
  ours. DEMO-375 removes the engine notion.
- **What works:** spec and standards as separate axes (we already have them);
  the smell baseline as a default for the standards axis where a repository
  documents nothing; `receiving-code-review`'s rule to verify a finding before
  acting on it, which matches what our sceptics do for the reviewer.
- **What gets in the way:** Matt Pocock's "never merge across axes" leaves no
  answer when two axes demand opposite changes, which is why our judge on
  contradiction stays an own decision. superpowers' single reviewer would
  collapse our axes into one.

#### Planning

- **superpowers** (`writing-plans`): a plan file for an engineer "with zero
  context and questionable taste": a header with global constraints, a file
  structure, tasks with exact paths, interfaces between tasks, and 2 to 5 minute
  steps that carry the actual code and commands; no placeholders; a self-review
  against the spec; then a choice between subagent-driven and inline execution.
  (`executing-plans`): review the plan critically, execute, stop on blockers.
- **Matt Pocock** (`to-spec`, `to-tickets`; older `to-prd`, `to-issues`): turn
  the conversation into a spec on the tracker without interviewing (problem,
  solution, a long list of user stories, implementation and testing decisions,
  out of scope), then cut it into tracer-bullet tickets with blocking edges,
  quizzing the user on granularity; wide refactors go expand, migrate,
  contract. The older `to-issues` tags each slice as HITL or AFK.
- **Overlap and difference:** superpowers plans *how* in great detail inside
  one file; Matt Pocock plans *what* and the order of slices on the tracker.
- **How we use them:** `issue-workflow` has its own planning (the
  `ImplementationPlan` schema, the plan as a tracker comment); the two
  superpowers plans in the repository are read by the plan island as prior art.
- **What works:** "no placeholders" as a plan failure; global constraints copied
  verbatim into every task; a self-review that maps every requirement to a
  step; Matt Pocock's slices with blocking edges and the HITL or AFK tag.
- **What gets in the way:** a plan file with full code contradicts ADR-0008 and
  the generated plan template, and the zero-context reader makes plans long
  enough to duplicate the diff.

#### Verification before completion

- **superpowers** (`verification-before-completion`): "no completion claims
  without fresh verification evidence". Before any claim: identify the command
  that proves it, run it in full, read the output and exit code, and only then
  state the result with the evidence. An agent's success report is not evidence;
  check the diff. "Requirements met" means re-reading the plan and checking it
  line by line.
- **Matt Pocock:** no separate skill; `diagnosing-bugs` asks for the command
  and its output before Phase 2.
- **How we use them:** not referenced in the repository and not invoked. The
  plugin already requires a per-criterion verification table before review
  (ADR-0008) and states the full test glob and validators as the definition of
  done.
- **What works:** "the command, its output, then the claim" as one rule; agent
  reports are claims, not evidence.
- **What gets in the way:** nothing in substance; as a separate always-on skill
  it would duplicate the verification table and the check beat of TDD.

#### Finishing a branch

- **superpowers** (`finishing-a-development-branch`): run the full suite on the
  tree being integrated, detect a worktree, present exactly three options (merge
  locally, push and open a PR, keep the branch), discard only on a typed
  confirmation, clean up only worktrees it created.
- **Matt Pocock:** none.
- **How we use them:** not referenced and not invoked. `issue-close` merges the
  PR with a merge commit, switches to the base branch and writes `done`, and
  `issue-workflow` never offers closure on its own.
- **What works:** "a green run only proves the tree it ran on".
- **What gets in the way:** a local merge as a first-class option bypasses the
  PR, its review and the tracker's magic words; the menu offers integration
  right after implementation, which our workflow deliberately does not.

## Decision criteria

A pattern is adopted only if all of these hold:

1. It can be written from scratch as a `nerd4rent:` skill or a section of an
   existing one, with no dependency on another plugin or an external tool.
2. It fits the five issue phases (backlog, todo, in-progress, in-review, done)
   and the existing human gate: only the user moves an issue to in-progress.
3. It does not break the rule that the three skill templates are generated from
   `workflow-graph.json`.
4. It earns its cost for a repository of markdown skills and Node scripts, not
   only for a large product codebase.

A pattern is rejected when it fails one of these, and the reason is recorded,
because the same idea tends to resurface later.

## Decisions

| Pattern | Source | Decision | Reason |
|---|---|---|---|---|
| Spec states WHAT and WHY only; HOW is decided afterwards | own decision | Adopt | Keeps the spec stable while the plan changes, and gives the plan a fixed thing to be checked against. |
| Spec is captured from what was said, sections that were never discussed stay empty | Matt Pocock (`to-spec`: synthesise what was discussed, no interview); the empty-section rule is our own | Adopt | An invented acceptance criterion is worse than a visible gap; this is the failure the spec layer must not have. |
| Spec required only for complex issues | (our grilling decision) | Adopt | None of the sources scale the spec to the task; the plugin does, with the threshold `issue-writer` already uses. |
| Full document set derived from requirements and an HTML mockup (data model, endpoint contracts, error registry) | own decision | Reject | Tied to web applications with screens; our work is skills, scripts and contracts. |
| Full traceability chain requirement to column to endpoint to test | own decision | Reject | Needs artifacts we do not have. The useful core is kept separately below. |
| Each acceptance criterion maps to a test or an explicit check | superpowers (`verification-before-completion`: requirements met means a line-by-line checklist) | Adopt | The narrow form of traceability: it makes "done" checkable and feeds the review's spec axis. |
| One ADR per hard-to-reverse decision, decisions tagged as scope, ADR or term during the interview | Matt Pocock (`domain-modeling`) | Adopt | Matches the docs discipline the plugin already states; tagging at the moment of decision avoids reconstructing it later. |
| Plan skeleton validated by a script | pstack | Adopt, narrowed (ADR-0008) | The plan's shape comes from the template generated from its schema; with no plan file in the repository there is nothing for a script to check. |
| Plan prose rules (sentence length, banned punctuation), ten parallel haiku verification lanes, per-PR review gates with video | pstack | Reject | Style preferences and an expensive live-verification regime built for UI products. |
| Vertical tracer-bullet slices with dependency graph and a human or unattended tag | Matt Pocock (`to-issues`, HITL and AFK slices; `to-tickets`) | Adopt | Maps directly onto sub-issues in the tracker; the tag tells the workflow which slices may be built without the user. |
| Stop for approval, and stop again when a file outside the plan must change | own decision | Adopt | Extends the existing in-progress gate to scope drift during implementation. |
| Stacked PRs and a publish-stack skill | own decision | Reject | One issue, one branch, one PR is the workflow's invariant; stacking is out of scope. |
| Red, green, refactor per acceptance criterion | superpowers (`test-driven-development`), Matt Pocock (`tdd`) | Adopt | The unit of work follows the criteria in the spec, so TDD and spec connect. |
| A criterion that cannot be written as a test is reported upward | own decision | Adopt | Turns a vague criterion into feedback to the spec instead of silent reinterpretation. |
| Never weaken, skip or delete a test to pass; no-tests mode only for changes without behaviour, and recorded | superpowers (`test-driven-development`: fix the code, not the test; exceptions only with the human); recording the skip is our own | Adopt | Hard rules that cost nothing and block the most common way agents fake green. |
| Separate test-author agent handing tests to an implementer | own decision | Reject | A second agent and a handoff for every change; the same discipline is reached with one agent following the loop. |
| Fourth beat "check": the repository's validators must be quiet, not only the tests | superpowers (`test-driven-development`: output pristine; `verification-before-completion`) | Adopt | In this repository that means the validators and the full test glob, already the stated definition of done. |
| Verify the foundation is green before starting a slice | own decision | Adopt | Separates existing breakage from new breakage before any code is written. |
| Failing repro committed before the fix | pstack | Adopt | The history shows the bug and the fix as two steps and fits atomic commits. |
| Debugging: reproduce first, hypotheses eliminated with evidence, mechanism confirmed before the fix, smallest change the evidence justifies | pstack, superpowers (`systematic-debugging`), Matt Pocock (`diagnosing-bugs`) | Adopt | The sources agree on this core; it becomes the debugging practice skill, extended per the practice decisions below. |
| Debugging: the author must always drive the real UI through a browser skill and never ask the user | pstack | Reject | Assumes a UI surface and a browser tool; replaced by "reproduce on the surface the bug lives on". |
| Numbered regression register wired into specs | own decision | Reject | Bookkeeping we do not need; a fixed bug gets a regression test and a commit that says so. |
| Fan-out: frame the done predicate, self-contained briefs, report as pass, issues or blocked with evidence, aggregate into a table with gaps | pstack | Adopt | Fits the existing workflow islands and makes dispatch a discipline instead of ad hoc. |
| Sequential by default, parallel and worktree per writer opt-in | superpowers (`dispatching-parallel-agents`, `subagent-driven-development`) | Adopt | Parallel writers on shared files cause conflicts; isolation only where slices are independent. |
| Guard the context window: agents return pointers and findings, not dumps | pstack | Adopt | The reducers in the existing islands already work this way; it becomes an explicit rule. |
| Arena: N competing candidates, pick a base, graft | pstack | Reject | High cost for every non-trivial artifact; kept only as an optional move inside grilling when a decision is one-way. |
| Remote cloud workers, per-role model and effort config file | pstack | Reject | Machine-specific configuration and a runtime we cannot assume across Claude Code, Cursor and other agents. |
| File-based handoff folder per feature | superpowers (`subagent-driven-development` workspace) | Reject | The tracker holds the spec, the plan and the history; a folder of files duplicates it. |
| Spec and plan as files in the repository | superpowers (`brainstorming`, `writing-plans`) | Reject (ADR-0008, replaces the first decision) | Those frameworks have no tracker as the source of truth; this plugin does, so the issue description is the spec and the plan stays a comment. |
| Orchestrator that does no work itself | superpowers (`subagent-driven-development`) | Reject | `issue-workflow` is already the orchestrator and also works; a pure router adds a layer. |
| Review axes with different lenses, because the same prompt run N times finds the same things | pstack | Adopt as rationale | Our four axes already differ by rule source; this is the argument for keeping them independent. |
| Model diversity per seat | pstack | Reject | Depends on named models and cost; independence by rule source is enough. |
| Judge invoked only when two axes truly contradict | own decision | Adopt | The island reduces by votes but has no answer for two axes demanding opposite things; this adds one without a routine extra pass. |
| Review output is a verdict, never auto-applied | pstack | Adopt | Matches the current flow, where the user decides what to address. |
| Review depth tiers selected by flag, forced deep on sensitive paths | own decision | Reject | Adds configuration to a flow that already fixes four axes. |
| One question at a time, both branches of each decision, hunt the unstated, push back on vague answers, stop when no branch is unresolved | Matt Pocock (`grilling`, `domain-modeling`) | Adopt | The core of the grilling skill; already close to the inline protocol in `issue-workflow`, now made a standalone skill. |
| Settle a question from the code or by running something before asking the human | pstack, Matt Pocock (`grilling`) | Adopt | Already stated as "verify facts yourself, ask only about decisions"; it moves into the grilling skill. |
| Domain terms captured as a glossary while talking | Matt Pocock (`domain-modeling`) | Adopt | Becomes the domain-modeling practice and feeds `CONTEXT.md`. |
| About twenty separate principle skills | pstack | Reject | Too many triggers for the model to route; the useful rules are folded into the five practice skills and the repository standards. |
| Recall skill for "where were we" | own decision | Reject | `project-continue` already does this from the checkpoint. |
| Verification asset: a project CLI plus a feature map to drive the running app | pstack | Reject for now | Valuable for applications; this repository has no running app. Revisit if the plugin gains one. |
| Installing external MCP servers and toolchain files for the user | own decision | Reject | Contradicts the goal of no external dependencies. |
| Project conventions read from a config section of `CLAUDE.md` | own decision | Reject | We already read `## Platform` and `CONTEXT.md`; a second config surface duplicates them. |

### Practice decisions: superpowers and Matt Pocock

Each of the nine practices read in the superpowers and Matt Pocock section gets
one of three verdicts:

- **own skill**: the practice is on the `issue-workflow` path and must work
  without another plugin (in Cursor, for a user without superpowers, and in
  Claude Code on this machine, where Matt Pocock's skills are not loaded);
- **thin overlay**: the external skill is good as it is, and our part is a few
  rules adding plugin context (tracker, phases, `## Platform`) around it;
- **dependency stays**: the practice is off the plugin's path, or the user runs
  the external skill by hand and the plugin never calls it.

"Own" also covers a practice that becomes a section of an existing skill
rather than a new one.

| Practice | Decision | What we take | What we leave out | Reason |
|---|---|---|---|---|
| TDD | Own skill `tdd` (DEMO-374) | Verify red as a mandatory step; name the break each test catches; expected values from an independent source, the tautological test as a named defect; one test, one minimal implementation per cycle; behaviour not text; mock only at system boundaries | The superpowers iron law (delete code written before its test, no exit without the human's permission); confirming seams with the user during implementation, since the seams go into the plan's test approach; Matt Pocock's refactoring outside the loop | It is the default implementation mode, so it must exist on every host. Our exit with a recorded reason contradicts the superpowers law, so the external skill cannot be wrapped, only replaced |
| Debugging | Own skill `debug` (DEMO-374, built in DEMO-405 after the grilling session of 2026-10-11) | pstack's method, plus Matt Pocock's feedback loop as the first phase (one command, already run, red on this bug), minimising the repro, up to 3 ranked falsifiable hypotheses shown to the user without blocking, tagged debug logs removed after the fix, proof that a forced mutation landed before a red test is trusted, secrets redacted before a command or its output is shown, the regression test only at a correct seam and written through `tdd`, the confirmed hypothesis recorded on the issue (validation section of the session summary) and in the commit; superpowers' stop after three failed fixes | Validation at every layer (defense in depth), which breaks our rule against handling impossible cases; the hand-off to an architecture skill we do not ship; the long pressure-test framing; backward tracing as a separate phase | Called from `tdd` (red for a reason other than the named one, or a red check), from `auto-issue-mode` before its red-tests stop, from planning of an issue labelled Bug, and directly on a narrow trigger; the two external skills disagree (one hypothesis against several), and our skill picks several, ranked. The problem of ours: a red test with an unknown cause had no owner between `tdd` and the `auto-issue-mode` stop, and Claude Code has no Debug Mode |
| Subagent dispatch | Skip (grilling verdict of 2026-10-11, DEMO-405; the skill `dispatch-agents` planned under DEMO-374 is not written) | Nothing as a skill. The independence test, the self-contained prompt with an explicit output shape and the diff as evidence already hold inside the islands and the `auto-issue-mode` stages, in code and in fixed prompts | `subagent-driven-development` as a whole: its plan file, the `.superpowers/sdd/` workspace, the mandatory worktree and the model chosen per role; the ad hoc dispatch skill itself | No problem of ours behind it: in about 259 Claude Code sessions on this machine all 42 `Agent` calls were `auto-issue-mode` stages and none was an ad hoc parallel dispatch. The islands and the implementation already fan out; the superpowers execution loop is built around a plan file that ADR-0008 removed |
| Grilling | Own skill `grill` (DEMO-374) | Matt Pocock's four rules, already restated as the inline protocol; from `brainstorming`, 2 to 3 approaches with a recommendation for one-way decisions only, and the scope check that splits an oversized request before refining it (it matches the sub-issue split in `issue-writer`) | `brainstorming`'s gate on every task, its spec file and its hand-off to `writing-plans`; the user-only `grill-me` and `grill-with-docs` wrappers | Called from `issue-writer` and planning. Today the inline protocol is what actually runs, because the Matt Pocock skill is not loaded; one skill replaces the two inline copies |
| Domain modelling | A step plus a validator, not a skill (grilling verdict of 2026-10-11, DEMO-405; the skill `model-domain` planned under DEMO-374 is not written) | The glossary discipline as an executor for the "glossary term" tag of `grill`: `issue-workflow` and `issue-writer` turn the tag into an acceptance criterion ("`CONTEXT.md ## Language` has the term", checked by `validate-context-terms`) and list `CONTEXT.md` in Affected Files, so the term is written during implementation; the validator fails on a term nothing outside `CONTEXT.md` uses; the `**Term**:` plus `_Avoid_` format stays; the ADR discipline stays as the repository convention in `docs/adr/` | A glossary-only `CONTEXT.md` (ours keeps `## Standards`); the multi-context `CONTEXT-MAP.md`, which this repository does not need; the modelling interview as its own skill (challenge terms, invented scenarios) | The problem of ours was in the executor, not in the method: `CONTEXT.md ## Language` was maintained by hand (12 commits in three days), the tag from `grill` had no owner, and three terms were used nowhere else. `CONTEXT.md` keeps its present shape because `## Standards` feeds the `repo-standards` axis and `## Language` feeds the `conventions` gatherer of the planning island |
| Review | Own, inside `review-verify` (DEMO-375), not a practice skill | The twelve-smell baseline as default rules of the `repo-standards` axis where a repository documents nothing, always as judgement calls the repository overrides; `receiving-code-review`'s rule to verify a finding before acting on it, when addressing verified findings | One generalist reviewer; "never merge across axes", since the judge on contradiction stays; the engine hints | The four axes, the reducer and the sceptics are already ours; DEMO-375 removes the engines |
| Planning | Own, stays in `issue-workflow` planning | "No placeholders" as a plan failure; global constraints copied into every step that needs them; a self-review mapping every acceptance criterion to a step; slices with blocking edges and the HITL or AFK tag (already adopted above) | The plan file, full code inside the plan, the zero-context reader, the long list of user stories | ADR-0008 keeps the plan on the tracker and its shape comes from the generated template |
| Verification before completion | Own, folded into the `tdd` check beat and the per-criterion verification table before review | "The command, its output, then the claim"; an agent's report is a claim, not evidence | A separate always-on skill | ADR-0008 already requires the verification table; a sixth skill would duplicate it |
| Finishing a branch | Own, already `issue-close` | Running the full suite on the tree being integrated, as an open point for `issue-close` | The local merge option, the integration menu right after implementation, worktree clean-up | `issue-close` merges through the PR with a merge commit, and the workflow never offers closure by itself |

**No practice is a thin overlay.** An overlay keeps a reference to the external
skill, which the independence validator planned for DEMO-376 forbids, and it
works only where that plugin is loaded: Matt Pocock's skills are not loaded in
Claude Code here, and superpowers is absent from any host where the user did
not install it.

**No practice stays a dependency.** All nine sit on the plugin's own path, or
are already covered by a skill the plugin ships. A user may keep either library
installed for work outside the plugin (`writing-skills`, worktrees, `teach`,
`prototype` and the rest); the plugin neither refers to nor needs them. One
side effect stays the user's to manage: with superpowers installed, its
SessionStart hook keeps steering every session towards `brainstorming` and its
own TDD before the plugin's gates run.

**Licence.** Both libraries are MIT. The skills take patterns and are written
in our own words, so no copyright notice is required. The inline grilling
protocol in `issue-workflow` follows Matt Pocock's `grilling` closely; the
`grill` skill rewrites it rather than moving it, and like `model-domain` (the
three-condition ADR test) credits Matt Pocock where the skill is documented. The smell baseline is
Fowler's (*Refactoring*, chapter 3) as Matt Pocock lists it, and is credited
that way. A skill that ends up reproducing a list close to its original
carries the MIT copyright line of that source.

## Recommended target architecture

### Shape

One path, owned by `issue-workflow`, with the tracker as the source of truth
for status, the spec and the plan (amended by ADR-0008):

```
issue (tracker)
  -> grill        resolve decisions, tag them as scope, ADR or term
  -> spec         WHAT and WHY, only when the issue is complex
  -> plan         HOW, ordered vertical slices, validated by a script
  -> build        red, green, refactor, check; debug and dispatch as needed
  -> review       four axes, own instructions, judge on contradiction
  -> close
```

The phases and the human gate do not change. The spec is the issue
description, refined during planning for a complex issue and written after the
user accepts it in chat; a change after work has started updates the
description and adds a `## Spec change` comment. Nothing of the spec or the
plan is committed.

### Skills

Practice skills, small, with narrow triggers, called from the nodes of
`issue-workflow` and from `issue-writer`. Five were planned on 2026-10-06; the
grilling session of 2026-10-11 (DEMO-405) kept three and settled the other two
rows below as a skip and as a step of existing skills:

| Skill | Takes from | Called from |
|---|---|---|
| `grill` | Matt Pocock grilling loop, the code-first rule, approaches with a recommendation for one-way decisions | issue-writer, planning, spec |
| `tdd` | per-criterion loop, superpowers verify red and never-weaken rules, Matt Pocock tautology and slicing rules, the check beat with evidence | implementation |
| `debug` | pstack bug-fix method, Matt Pocock feedback loop and ranked hypotheses (up to three), superpowers three-fix breaker, failing repro before the fix, proof of the forced mutation, secret redaction | `tdd` when red for an unnamed reason or a red check, `auto-issue-mode` before its red-tests stop, planning of an issue labelled Bug, and a narrow direct trigger |
| `dispatch-agents` | not written: skip by the grilling verdict of 2026-10-11 (DEMO-405), no ad hoc dispatch in the data | the islands and the `auto-issue-mode` stages keep the fan-out in code |
| `model-domain` | not written: a step of `issue-workflow` and `issue-writer` plus the `validate-context-terms` validator (DEMO-405) | grilling tag "glossary term" becomes an acceptance criterion |

The spec layer is not a sixth practice skill: it is a step of `issue-workflow`
that fills the full variant of the generated issue template, so it stays out
of hand editing.

### Review

The four axes stay. The notion of an engine per axis disappears: each axis gets
its own instructions inside the plugin. A new reducer step handles two axes
that contradict each other by calling a judge once for that conflict. `/code-review`
is not offered in our menu.

### What stays untouched

The platform adapters, status strategies, nerdbrain skills, the workflow islands
and their reducers, and the manifest lockstep.

## Mapping to the next stages

| Stage | Content from this document |
|---|---|
| Spec layer (DEMO-373) | Amended by ADR-0008: the spec refinement step on the issue description with the adaptive threshold; a check per acceptance criterion; the affected-files list and scope-drift stop; the criteria verification table before review; `## Spec change` comments. No spec or plan files and no path migration. |
| Practice skills (DEMO-374) | `grill`, `tdd`, `debug`, `dispatch-agents`, `model-domain`, written from scratch from the adopted patterns above and the practice decisions (take and leave-out columns), with narrow triggers. Verification before completion folds into `tdd`; no thin overlay and no remaining dependency. Outcome: `tdd` shipped in DEMO-374, `grill` in DEMO-392; the grilling session of DEMO-405 (2026-10-11) built `debug`, skipped `dispatch-agents` and replaced `model-domain` with a step plus the `validate-context-terms` validator. |
| Review (DEMO-375) | Own instructions per axis, removal of the engine concept, judge on axis contradiction, update of `review-verify` and its contract; the smell baseline as default `repo-standards` rules and verify-before-acting when addressing findings. |
| Refactor and cleanup (DEMO-376) | Replace every `superpowers:*` and `mattpocock-skills:*` reference, a validator that fails on any such reference, README and `CONTEXT.md` updates, lockstep manifest bump. The practice decisions leave no reference to keep, so "every reference" holds without exceptions. |

## Open points left to the later stages

- The exact threshold of "complex" for requiring a spec; the plan is to reuse
  the `issue-writer` threshold and confirm it while building the spec layer.
- Whether `dispatch-agents` needs different wording on hosts that lack the
  Workflow tool (Cursor), given the existing Task-based fallback.
- ~~Whether the judge for contradicting axes is a seventh agent or a role of the
  existing synthesizer.~~ Settled in the review stage: a separate read-only
  `review-judge` agent, called once per conflict, so the synthesizer stays
  summary-only. A conflict is two verified findings from different axes on the
  same `file:line` anchor, detected by the reducer.
- Whether `issue-close` runs the full test suite on the tree it is about to
  merge, the one part of superpowers' `finishing-a-development-branch` worth
  taking; it would add a check to a deliberately mechanical chain.
