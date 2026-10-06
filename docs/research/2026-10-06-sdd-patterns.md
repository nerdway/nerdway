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
