# Research: spec-driven development patterns

Checked on 2026-10-06.

*Amended 2026-10-06 by ADR-0008: the spec and the plan live on the tracker, not
in the repository. The issue description is the spec, the `## Implementation
plan` comment is the plan, and the repository holds code only. The rows and
sections below that placed the spec and the plan in files are updated and
marked.*

## Why this document exists

The plugin covers the issue lifecycle (issue, plan, implement, review, close),
but the practices around it are borrowed: TDD, debugging, subagent dispatch,
code review and grilling come from `superpowers:*` and `mattpocock-skills:*`,
and nothing leads from requirements to a specification that steers the plan.
The goal of the follow-up work is a plugin that carries the whole path on its
own. Before writing any skill, this document reads an existing agent-workflow
system, pstack, decides pattern by pattern what to adopt and what to reject,
and ends with the target architecture the next stages build.

The project is read for patterns, not for text. Nothing here is copied, and
the skills we write are written from scratch.

## How the sources were read

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
| Debugging: reproduce first, hypotheses eliminated with evidence, mechanism confirmed before the fix, smallest change the evidence justifies | pstack | Adopt | The only source with a real method; it becomes the debugging practice skill. |
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

Five practice skills, small, with narrow triggers, called from the nodes of
`issue-workflow` and from `issue-writer`:

| Skill | Takes from | Called from |
|---|---|---|
| `grill` | Matt Pocock grilling loop, the code-first rule | issue-writer, planning, spec |
| `tdd` | per-criterion loop, superpowers never-weaken rules and pristine output, the check beat | implementation |
| `debug` | pstack bug-fix method, failing repro before the fix | implementation, when a test or check fails unexpectedly |
| `dispatch-agents` | pstack swarm framing and reporting, superpowers opt-in isolation | any node that fans out |
| `model-domain` | Matt Pocock glossary and ADR discipline | grilling, spec |

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
