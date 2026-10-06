# Research: spec-driven development patterns

Checked on 2026-10-06.

## Why this document exists

The plugin covers the issue lifecycle (issue, plan, implement, review, close),
but the practices around it are borrowed: TDD, debugging, subagent dispatch,
code review and grilling come from `superpowers:*` and `mattpocock-skills:*`,
and nothing leads from requirements to a specification that steers the plan.
The goal of the follow-up work is a plugin that carries the whole path on its
own. Before writing any skill, this document compares four existing projects,
decides pattern by pattern what to adopt and what to reject, and ends with the
target architecture the next stages build.

The projects are read for patterns, not for text. Nothing here is copied, and
the skills we write are written from scratch.

## How the sources were read

Each repository was inspected through the GitHub API on the date above: file
tree, licence, the skills and agents most relevant to the seven categories
below, and the opening of each file (frontmatter and the first sections). The
files were not read end to end. A category marked "none found" means no skill,
agent or playbook for it appeared in the tree or in the descriptions; it is not
a claim that the project never does it.

## Sources

| Source | Link | Revision checked | Licence |
|---|---|---|---|
| pstack (upstream, Cursor plugin by Lauren Tan) | https://github.com/cursor/plugins/tree/main/pstack | `df581122c` | MIT (`pstack/LICENSE`) |
| pstack-claude (Claude Code port of pstack, by lifeofladi) | https://github.com/lifeofladi/pstack-claude | `de39d5ba0` | MIT |
| groundwork (mauriciovieira) | https://github.com/mauriciovieira/groundwork | `78c673d42` | MIT |
| claude-sdd (Francisco-Donadio) | https://github.com/Francisco-Donadio/claude-sdd | `931459414` | MIT |
| pspt (meQlause) | https://github.com/meQlause/pspt | `dea183c4e` | MIT |

Notes on identification:

- `poteto/pstack` as a repository does not exist (it returns 404). The
  upstream lives at `cursor/plugins`, directory `pstack`. The Claude Code port
  was read for the skill bodies because it carries the same skills with the
  primitives translated.
- The names `groundwork` and `claude-sdd` match several unrelated repositories
  on GitHub. The ones above were chosen deliberately: groundwork for its
  interview, slicing and two-axis review, claude-sdd for its spec-to-TDD
  pipeline with ticket intake. Other repositories with the same names were not
  read.
- All five licences are MIT, which permits reading and reuse. Because the
  decision is to adopt patterns and write the skills ourselves, no licence
  obligation (attribution, notice file) arises from this work. groundwork
  itself credits the pstack articles in its own `NOTICE`, which is a reminder
  to credit an idea's origin in the ADR that adopts it.

## What each source is

- **pstack** is a large agent-workflow system: a router mode, about two dozen
  playbooks (bug fix, feature, refactor, multi-phase plan, shipping), around
  twenty engineering principles as separate skills, and fan-out primitives
  (`swarm`, `arena`, `interrogate`). It has no specification layer; the plan is
  the deliverable and is checked by a script. Its strength is discipline about
  evidence: nothing is called done until it was observed running.
- **groundwork** is an opt-in framework: an interview produces a PRD and ADRs,
  the PRD is sliced into vertical tracer-bullet issues in the tracker, and each
  slice is built with TDD. Review runs on two independent axes (standards,
  spec). Everything is behind explicit commands.
- **claude-sdd** is an orchestrator that hands one feature through ten
  specialised agents (explore, spec, plan, architecture, design, tests,
  implement, review, verify, archive) and stops for approval at three
  checkpoints. Handoffs are files in a per-feature folder. It reads project
  conventions from an `## SDD config` section of `CLAUDE.md`.
- **pspt** derives a full engineering document set (data model, endpoint
  contracts, error registry, phased plan) from requirements and a static HTML
  mockup, then builds one exit criterion per invocation. It depends on two
  external tools (a code-indexing MCP server and a second helper) that it
  installs for the project.

## Patterns by category

### Spec

| Source | Pattern |
|---|---|
| pstack | No spec layer. A multi-phase plan with a fixed skeleton is the highest artifact; a script validates its shape. |
| groundwork | `prd.md` (problem, users, goals, non-goals, acceptance criteria, out of scope) written either from an interview or by capturing what was already discussed, never inventing missing sections. One ADR per hard decision, glossary terms tagged along the way. |
| claude-sdd | A spec-writer owns WHAT and WHY only and is forbidden from deciding implementation; an architect decides HOW afterwards from the approved spec. |
| pspt | The spec set is derived from requirements the user already wrote; everything traces to something written, nothing is invented. A traceability chain links requirement, screen, column, endpoint and test. |

### Planning

| Source | Pattern |
|---|---|
| pstack | The plan is a checklist the operator audits from evidence. Each PR is one change with its own verification block (unit, live, performance). A plan for a one- or two-file change is skipped. |
| groundwork | The PRD is cut into tracer-bullet vertical slices, each tagged as needing a human or safe to run unattended, with a dependency graph, created in the tracker. |
| claude-sdd | A task planner turns the spec and design into ordered tasks; a large change can ship as a stack of branches. |
| pspt | A change is talked through against the code, then written as request (scope, checkable criteria), plan (affected and at-risk files, tests before code) and phases. Work stops for approval, and stops again the moment a file outside the plan has to change. |

### TDD

| Source | Pattern |
|---|---|
| pstack | Failing test first for bug fixes only, and only when the test path is cheap; otherwise say why and use the closest executable check. The failing repro lands in history before the fix. |
| groundwork | Red, green, refactor per acceptance criterion. A criterion that cannot be stated as a test is a defect in the slice, reported upward instead of reinterpreted. |
| claude-sdd | A separate test author writes the failing tests from the design contracts and confirms they fail for the right reason. Tests are never weakened, skipped or deleted to pass. A no-tests mode exists for changes without behaviour, and the skip is recorded. |
| pspt | Four beats: red, green, clean, check. A green test is not the end; the check command must also be quiet. One exit criterion per invocation. |

### Debugging

| Source | Pattern |
|---|---|
| pstack | The bug-fix playbook: reproduce it yourself on the real surface, form hypotheses and eliminate them with runtime evidence (binary search), confirm the mechanism before designing the fix, verify on the same surface, never ship a change that evidence did not justify. |
| groundwork | None found as a skill. The build skill checks the foundation first and refuses to start a slice on a red base, so existing breakage is not confused with new breakage. |
| claude-sdd | None found. A verifier reports pass or fail with evidence and does not fix. |
| pspt | None found as a debugging method. A `reg` skill reserves a numbered regression test for a defect and wires it into the specs. |

### Subagent dispatch

| Source | Pattern |
|---|---|
| pstack | `swarm`: frame the done predicate and report shape, fan out in one message with self-contained briefs, aggregate into a compact table with explicit gaps. `arena`: N competing candidates, pick a base, graft. Model and effort per role from a config file. Rule: guard the context window by returning pointers, not dumps. |
| groundwork | Sequential in the main agent by default; parallel dispatch and a worktree per slice are opt-in. One builder agent implements one slice in isolation. |
| claude-sdd | An orchestrator that does no work itself and delegates each stage to a named agent; handoffs go through files in a feature folder. |
| pspt | None found. Skills run a single loop (`build-long` repeats `build`). |

### Review

| Source | Pattern |
|---|---|
| pstack | `interrogate`: a panel where every seat has a different lens, model and effort tier, because reviewers running the same prompt agree and miss the same things. The output is a verdict and is never auto-applied. |
| groundwork | Two independent workers, standards and spec, deliberately blind to each other, then merged. A third judge is called only where the two axes truly contradict each other, never as a routine pass. |
| claude-sdd | A cheap single-pass reviewer by default, with heavier tiers selectable by flag; sensitive paths force the deepest tier. |
| pspt | None found as a separate reviewer; the check command is the gate. |

### Grilling

| Source | Pattern |
|---|---|
| pstack | No grilling skill found. A rule instead: classify a question before asking it, and when the answer is a fact observable by running something, run a throwaway prototype rather than ask the human. |
| groundwork | An interview loop: one question at a time, walk both branches of every decision, hunt for the unstated (edge cases, failure, scale), push back on vague answers, tag each decision as scope, ADR or term, stop when no branch is unresolved. |
| claude-sdd | Approval checkpoints rather than an interview; open questions are surfaced at the first checkpoint. |
| pspt | A conversation of one or two questions at a time that reads the code to settle each idea before asking, until the user says ready. |

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
|---|---|---|---|
| Spec states WHAT and WHY only; HOW is decided afterwards | claude-sdd, groundwork | Adopt | Keeps the spec stable while the plan changes, and gives the plan a fixed thing to be checked against. |
| Spec is captured from what was said, sections that were never discussed stay empty | groundwork, pspt | Adopt | An invented acceptance criterion is worse than a visible gap; this is the failure the spec layer must not have. |
| Spec required only for complex issues | (our grilling decision) | Adopt | None of the sources scale the spec to the task; the plugin does, with the threshold `issue-writer` already uses. |
| Full document set derived from requirements and an HTML mockup (data model, endpoint contracts, error registry) | pspt | Reject | Tied to web applications with screens; our work is skills, scripts and contracts. |
| Full traceability chain requirement to column to endpoint to test | pspt | Reject | Needs artifacts we do not have. The useful core is kept separately below. |
| Each acceptance criterion maps to a test or an explicit check | pspt, groundwork | Adopt | The narrow form of traceability: it makes "done" checkable and feeds the review's spec axis. |
| One ADR per hard-to-reverse decision, decisions tagged as scope, ADR or term during the interview | groundwork | Adopt | Matches the docs discipline the plugin already states; tagging at the moment of decision avoids reconstructing it later. |
| Plan skeleton validated by a script | pstack | Adopt | The plugin already validates its contracts with scripts; a plan with a fixed shape is checked the same way. |
| Plan prose rules (sentence length, banned punctuation), ten parallel haiku verification lanes, per-PR review gates with video | pstack | Reject | Style preferences and an expensive live-verification regime built for UI products. |
| Vertical tracer-bullet slices with dependency graph and a human or unattended tag | groundwork | Adopt | Maps directly onto sub-issues in the tracker; the tag tells the workflow which slices may be built without the user. |
| Stop for approval, and stop again when a file outside the plan must change | pspt | Adopt | Extends the existing in-progress gate to scope drift during implementation. |
| Stacked PRs and a publish-stack skill | claude-sdd | Reject | One issue, one branch, one PR is the workflow's invariant; stacking is out of scope. |
| Red, green, refactor per acceptance criterion | groundwork, pspt | Adopt | The unit of work follows the criteria in the spec, so TDD and spec connect. |
| A criterion that cannot be written as a test is reported upward | groundwork | Adopt | Turns a vague criterion into feedback to the spec instead of silent reinterpretation. |
| Never weaken, skip or delete a test to pass; no-tests mode only for changes without behaviour, and recorded | claude-sdd | Adopt | Hard rules that cost nothing and block the most common way agents fake green. |
| Separate test-author agent handing tests to an implementer | claude-sdd | Reject | A second agent and a handoff for every change; the same discipline is reached with one agent following the loop. |
| Fourth beat "check": the repository's validators must be quiet, not only the tests | pspt | Adopt | In this repository that means the validators and the full test glob, already the stated definition of done. |
| Verify the foundation is green before starting a slice | groundwork | Adopt | Separates existing breakage from new breakage before any code is written. |
| Failing repro committed before the fix | pstack | Adopt | The history shows the bug and the fix as two steps and fits atomic commits. |
| Debugging: reproduce first, hypotheses eliminated with evidence, mechanism confirmed before the fix, smallest change the evidence justifies | pstack | Adopt | The only source with a real method; it becomes the debugging practice skill. |
| Debugging: the author must always drive the real UI through a browser skill and never ask the user | pstack | Reject | Assumes a UI surface and a browser tool; replaced by "reproduce on the surface the bug lives on". |
| Numbered regression register wired into specs | pspt | Reject | Bookkeeping we do not need; a fixed bug gets a regression test and a commit that says so. |
| Fan-out: frame the done predicate, self-contained briefs, report as pass, issues or blocked with evidence, aggregate into a table with gaps | pstack | Adopt | Fits the existing workflow islands and makes dispatch a discipline instead of ad hoc. |
| Sequential by default, parallel and worktree per writer opt-in | groundwork | Adopt | Parallel writers on shared files cause conflicts; isolation only where slices are independent. |
| Guard the context window: agents return pointers and findings, not dumps | pstack | Adopt | The reducers in the existing islands already work this way; it becomes an explicit rule. |
| Arena: N competing candidates, pick a base, graft | pstack | Reject | High cost for every non-trivial artifact; kept only as an optional move inside grilling when a decision is one-way. |
| Remote cloud workers, per-role model and effort config file | pstack | Reject | Machine-specific configuration and a runtime we cannot assume across Claude Code, Cursor and other agents. |
| File-based handoff folder per feature | claude-sdd | Reject | The tracker holds status and comments, the repo holds the spec and plan; a third location duplicates both. |
| Orchestrator that does no work itself | claude-sdd | Reject | `issue-workflow` is already the orchestrator and also works; a pure router adds a layer. |
| Review axes with different lenses, because the same prompt run N times finds the same things | pstack | Adopt as rationale | Our four axes already differ by rule source; this is the argument for keeping them independent. |
| Model diversity per seat | pstack | Reject | Depends on named models and cost; independence by rule source is enough. |
| Judge invoked only when two axes truly contradict | groundwork | Adopt | The island reduces by votes but has no answer for two axes demanding opposite things; this adds one without a routine extra pass. |
| Review output is a verdict, never auto-applied | pstack | Adopt | Matches the current flow, where the user decides what to address. |
| Review depth tiers selected by flag, forced deep on sensitive paths | claude-sdd | Reject | Adds configuration to a flow that already fixes four axes. |
| One question at a time, both branches of each decision, hunt the unstated, push back on vague answers, stop when no branch is unresolved | groundwork | Adopt | The core of the grilling skill; already close to the inline protocol in `issue-workflow`, now made a standalone skill. |
| Settle a question from the code or by running something before asking the human | pspt, pstack | Adopt | Already stated as "verify facts yourself, ask only about decisions"; it moves into the grilling skill. |
| Domain terms captured as a glossary while talking | groundwork | Adopt | Becomes the domain-modeling practice and feeds `CONTEXT.md`. |
| About twenty separate principle skills | pstack | Reject | Too many triggers for the model to route; the useful rules are folded into the five practice skills and the repository standards. |
| Recall skill for "where were we" | groundwork | Reject | `project-continue` already does this from the checkpoint. |
| Verification asset: a project CLI plus a feature map to drive the running app | groundwork, pstack | Reject for now | Valuable for applications; this repository has no running app. Revisit if the plugin gains one. |
| Installing external MCP servers and toolchain files for the user | pspt | Reject | Contradicts the goal of no external dependencies. |
| Project conventions read from a config section of `CLAUDE.md` | claude-sdd | Reject | We already read `## Platform` and `CONTEXT.md`; a second config surface duplicates them. |

## Recommended target architecture

### Shape

One path, owned by `issue-workflow`, with the tracker as the source of truth
for status and the repository as the home of the spec and the plan:

```
issue (tracker)
  -> grill        resolve decisions, tag them as scope, ADR or term
  -> spec         WHAT and WHY, only when the issue is complex
  -> plan         HOW, ordered vertical slices, validated by a script
  -> build        red, green, refactor, check; debug and dispatch as needed
  -> review       four axes, own instructions, judge on contradiction
  -> close
```

The phases and the human gate do not change. In todo the spec is posted as an
issue comment; after the user moves the issue to in-progress the spec is the
first commit on the branch and the plan points at it.

### Skills

Five practice skills, small, with narrow triggers, called from the nodes of
`issue-workflow` and from `issue-writer`:

| Skill | Takes from | Called from |
|---|---|---|
| `grill` | groundwork interview loop, pspt conversation, the code-first rule | issue-writer, planning, spec |
| `tdd` | groundwork per-criterion loop, claude-sdd hard rules, pspt check beat | implementation |
| `debug` | pstack bug-fix method, failing repro before the fix | implementation, when a test or check fails unexpectedly |
| `dispatch-agents` | pstack swarm framing and reporting, groundwork opt-in isolation | any node that fans out |
| `model-domain` | groundwork glossary tagging | grilling, spec |

The spec layer is not a sixth practice skill: it is a step of `issue-workflow`
with its own template, generated from a schema in `workflow-graph.json` like the
other three templates, so it stays out of hand editing.

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
| Spec layer (DEMO-373) | The spec step and its generated template; adaptive threshold; the plan skeleton with its validator; scope-drift stop; the spec as first commit on the branch; migration of `docs/superpowers/{plans,specs}` paths read by `plan-context-fanout`. |
| Practice skills (DEMO-374) | `grill`, `tdd`, `debug`, `dispatch-agents`, `model-domain`, written from scratch from the adopted patterns above, with narrow triggers. |
| Review (DEMO-375) | Own instructions per axis, removal of the engine concept, judge on axis contradiction, update of `review-verify` and its contract. |
| Refactor and cleanup (DEMO-376) | Replace every `superpowers:*` and `mattpocock-skills:*` reference, a validator that fails on any such reference, README and `CONTEXT.md` updates, lockstep manifest bump. |

## Open points left to the later stages

- The exact threshold of "complex" for requiring a spec; the plan is to reuse
  the `issue-writer` threshold and confirm it while building the spec layer.
- Whether `dispatch-agents` needs different wording on hosts that lack the
  Workflow tool (Cursor), given the existing Task-based fallback.
- Whether the judge for contradicting axes is a seventh agent or a role of the
  existing synthesizer; this is a decision for the review stage with its own
  trade-off.
