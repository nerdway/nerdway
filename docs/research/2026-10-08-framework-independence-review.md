# Review: framework independence and gaps against pstack, superpowers and Matt Pocock

Checked on 2026-10-08. Reviewer: Claude Fable 5.1 (`claude-fable-5-1`), reading the repository at `main` `fa7f3fd` (0.48.0) and the three sources at the revisions in the Sources table. This document follows the conventions of `docs/research/2026-10-06-sdd-patterns.md` and does not repeat it: the patterns, the practice-by-practice reading and the decisions table live there. Here are only the verdict, what changed since, and what to do next.

## 1. Verdict

### The repository: independent, yes

The repository no longer calls, offers or falls back to any skill of `superpowers` or `mattpocock-skills`. The 34 remaining textual hits of `rg -n 'superpowers|mattpocock'` (section 3) are the rule that forbids calls (CONTEXT.md, ADR-0009, the validator and its fixtures), two ADRs that credit where an idea came from, and four archived files that ADR-0009 exempts. None of them changes what a session does. Every practice on the issue path runs on the plugin's own text: the inline grilling protocol, `tdd`, the four review axes with their own prompts, the plan and session templates.

One leftover does not show up in that grep and is worth naming: `skills/new-project-workflow/SKILL.md:263` still offers `/grill-me` as a manual menu item, and line 288 explains it. It is not a call in the ADR-0009 sense (the validator is right to let it pass), but it is the last place where the plugin's behaviour depends on another plugin being installed. It disappears with the `grill` skill (section 6, issue draft P8).

The validator itself holds: the regex catches the invocation form in every tracked file, the five exempt paths are exactly the files that must contain those strings, and the decision to let prose name the plugins (ADR-0009) is the right one, since the research documents and the ADRs would otherwise be unwritable.

### The machine: independent, no

A Claude Code session on this machine is still steered by superpowers before any plugin gate runs:

| Blocker | Evidence | What it does |
|---|---|---|
| `superpowers@superpowers-marketplace` 6.2.0 is enabled | `~/.claude/settings.json` `enabledPlugins`; `~/.claude/plugins/installed_plugins.json` | Its `SessionStart` hook (`hooks/hooks.json`, matcher `startup|clear|compact`) injects `using-superpowers` into every session, which tells the agent to invoke `brainstorming` before any creative work and its TDD before any code. Observed in this session's own start. |
| `~/.agents/skills` holds stale copies of four plugin skills under their June names | `linear-issue-workflow`, `linear-issue-writer`, `nerdbrain-wiki`, `new-project-workflow`; `~/.agents/.skill-lock.json` points them at `skills/linear-issue-workflow/SKILL.md`, a path that no longer exists | Cursor and every agent that reads that directory sees two generations of the same skills side by side; `npx skills update` cannot refresh them. Claude Code does not read the directory. |
| `~/.agents/skills` holds 35 Matt Pocock skills | same directory | Harmless for Claude Code; relevant for Cursor only when the plugin is not installed there. |
| The installed plugin lags `main` | `nerdway@nerdway` 0.45.0 installed, `main` at 0.48.0 | Sessions run three releases behind the repository they are reviewing. |
| `mattpocock-skills@mattpocock` 1.2.0 installed, not enabled | `enabledPlugins` has no entry for it | No effect on Claude Code sessions. Listed so nobody re-enables it by accident. |

Recommendation, not executed here (out of scope by the spec): remove `superpowers@superpowers-marketplace` from `enabledPlugins` in the nix-managed `~/.claude/settings.json`, remove the four stale copies from `~/.agents/skills` (`npx skills remove` or `rm -rf`), and update the installed plugin (`/plugin marketplace update nerdway`, `/plugin update nerdway@nerdway`). The three other superpowers marketplace plugins (`superpowers-chrome`, `superpowers-lab`, `superpowers-developing-for-claude-code`) are installed but disabled and can stay.

### Is it the best issue framework it can be?

Not yet, and the gap is not in parity with the three sources. Measured against its own principles the plugin is ahead of all three on the things it chose to be about: the spec on the tracker, the status gate outside the agent, the typed contract, adversarial verification with counted degradation. Where it is behind is in finishing what it already decided:

- the autonomous path reviews with one subagent instead of the review island (section 4, F4);
- a dead sceptic is invisible in the review stats (F1, F2), which contradicts "degradation is visible, never silent";
- CI runs the release guards but not the test suite or the contract validator (F13), so a green pull request can carry a broken contract;
- two of fifteen skills have evals and nothing runs them;
- the biggest skill is 620 lines and is loaded on every turn of every issue;
- the practice skills of DEMO-380 (`grill`, `debug`, `dispatch-agents`, `model-domain`) were decided on 2026-10-07 and the issue was closed the same day without work.

The proposed issues in section 7 are ordered by that judgement.

## 2. Sources

| Source | Link | Checked | Revision | Licence |
|---|---|---|---|---|
| superpowers (Jesse Vincent), `main` | https://github.com/obra/superpowers | 2026-10-08 | 6.4.2, `8ca22db` (2026-09-25); installed and pinned on 2026-10-07: 6.2.0, `3dcbd5c4b` | MIT (`LICENSE`, 2025 Jesse Vincent) |
| mattpocock/skills (Matt Pocock), `main` | https://github.com/mattpocock/skills | 2026-10-08 | 1.3.1, `b0618bc` (2026-10-08); pinned on 2026-10-07: 1.2.0, `ed37663cc` | MIT (`LICENSE`, 2026 Matt Pocock) |
| pstack (Lauren Tan), directory `pstack` of cursor/plugins, `main` | https://github.com/cursor/plugins/tree/main/pstack | 2026-10-08 | `ccb5507` (2026-10-07); the directory's last commit is `df58112` (2026-10-05), the revision pinned on 2026-10-06 | MIT (`pstack/LICENSE`, 2026 Lauren Tan) |

How they were read: each repository was cloned (blob-less) into the session scratchpad and read as `git diff <pinned>..<main>` over the skills the earlier research covers, plus every skill added since, in full. pstack has no delta since the pin; its skill tree was read for descriptions and the skills that the gap table names were read in full (`poteto-mode`, `show-me-your-work`, `correct`, `reflect`, `blast-radius`, `interrogate`, `recall`, the `opening-a-pr`, `session-pickup`, `pause-safely` and `bug-fix` playbooks). The machine state comes from `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, the superpowers hook file and `~/.agents/`.

### What changed since the pins

**superpowers 6.2.0 → 6.4.2** (4 release commits, 46 skill files):

- `brainstorming` gained a three-path router: spike (a feasibility probe whose output is an answer), bounded (a change to an existing flow, short design in chat, no spec file), architectural (the old full process). The classification is said out loud so the human can override it, and it only ratchets up.
- `writing-plans` was cut back: a step carries the signature, the file and the spec's values, not the function body; a plan longer than the code it describes is called a transcript; a `Spec:` pointer and a `Review Focus` section (the five input classes the spec implies but no task's tests exercise) were added; the plan-document reviewer prompt was deleted.
- `executing-plans` became "native" inline execution: a ledger file per plan in `.superpowers/sdd/`, `task-start` and `task-done` scripts, `Ruling:` lines for every deviation with its cost if wrong, four stop classes and nothing else stops the run, a final whole-branch review and one fix pass.
- `subagent-driven-development`: rulings replace "ask the human which governs"; batching of small same-shape tasks into one dispatch; a no-subagents contract for implementers and reviewers; bounded waiting on dispatched children.
- `requesting-code-review`: "the spec is a vision document, its silence is not permission"; a "declined to judge" list the executor rules on.
- `test-driven-development`: "other tests means the project's suite"; a red test seen and not reported is a report falsified by omission.
- `finishing-a-development-branch`: handling of a refused worktree removal.
- New `diagnosing-superpowers`: mines session transcripts for cost, plan adherence, repeated work and stumbles, and bundles a redacted report or GitHub issue.
- Host references for Claude Code (a nested orchestrator subagent on a mid-tier model for SDD), Hermes, Muse, Devin and OpenCode.

**mattpocock/skills 1.2.0 → 1.3.1** (179 files, with the 1.3 release branch merged):

- `grilling` now works in rounds: the whole frontier of answerable questions per round, numbered, each with a recommended answer worded so that "yes" accepts it; facts are fetched by sub-agents without blocking the round.
- `tdd`: each proposed seam gets a one-line note on what it catches and what it misses; a pointer to `codebase-design` for seam vocabulary.
- `diagnosing-bugs`: redact secrets before showing anything; prove a forced mutation landed before trusting a red; the hand-off to an architecture skill and the post-mortem question were dropped.
- `code-review`: search the repository for every standards file (`CODING_STANDARDS.md`, `CONTRIBUTING.md` must be on the list); sub-agents run in the foreground.
- `to-tickets`: tickets become sub-issues of the source issue; native blocking links where the tracker has them.
- `implement`: fetch a passed ticket and state its title; call `tdd` and `code-review` through the Skill tool.
- New skills: `retro` (session retrospective proposing environment improvements: navigation pointers, automated checks, coding standards with mechanical rules pushed to deterministic checks, tool economy, no-ops, information access), `pr` (PR body template: summary as diagram or diff sketch, before/after evidence, merge danger as one-way or two-way door plus blast radius), `implement-spec` (integration branch, implementer subagents per ticket in worktrees, a merger subagent, frontier concurrency), `wizard` (bash wizard for human-only setup steps), `wait-what`, `writing-for-agents` (context pointers, information hierarchy, completion criteria, leading words, pruning, no-ops), `chief-of-staff` (in progress).
- `CONTEXT.md` was renamed `GLOSSARY.md` throughout; `SCOPE.md` and `.out-of-scope/` records were added to the repository; six skills were deleted (`design-an-interface`, `qa`, `request-refactor-plan`, `ubiquitous-language`, `resolving-merge-conflicts`, `batch-grill-me`, `writing-great-skills`, the personal bucket).

**pstack**: no change in the `pstack` directory since `df58112`. The earlier research read it superficially; this review read its skill list in full (23 playbooks under `poteto-mode`, 22 principle skills, the fan-out and review skills, the Slack triage automations) so the gap table can name what it has.

## 3. Remaining references

Command, run on the final tree of this branch:

```bash
rg -n 'superpowers|mattpocock' --glob '!docs/research/**' --glob '!docs/superpowers/**' .
```

34 hits in 10 files, none in `skills/`, `agents/`, `workflows/`, `adapters/` or `scripts/lib/`. Resolution values: **stays** with a reason. No hit needs a new issue; the plan's "remove in DEMO-376" and "replace in DEMO-380" values are moot, since DEMO-376 is done and left exactly these.

| # | Hit | What it is | Resolution |
|---|---|---|---|
| 1 | `docs/CONTRIBUTING.md:79` | Describes the external-references validator to contributors | stays: documentation of the guard |
| 2 | `CONTEXT.md:35` | Standard 8, the rule itself | stays: the rule names what it forbids |
| 3 | `CONTEXT.md:36` | Standard 8, continued | stays: as above |
| 4 | `docs/plans/2026-08-06-linear-cli-migration.md:3` | Archived plan header written by `writing-plans` | stays: archive exempted by ADR-0009, kept verbatim |
| 5 | `docs/plans/2026-08-06-linear-cli-migration.md:11` | Archived plan, old spec path | stays: archive |
| 6 | `docs/plans/2026-08-06-linear-cli-migration.md:1213` | Archived plan, old spec path | stays: archive |
| 7 | `docs/plans/2026-08-06-linear-cli-migration.md:1228` | Archived plan, old spec path in a `git add` line | stays: archive |
| 8 | `docs/plans/2026-08-06-linear-cli-migration.md:1277` | Archived plan footer | stays: archive |
| 9 | `docs/plans/2026-08-06-linear-cli-migration.md:1278` | Archived plan footer | stays: archive |
| 10 | `docs/adr/0008-spec-in-issue-description.md:3` | ADR-0009 amendment note naming the old directory | stays: history of the move |
| 11 | `docs/adr/0008-spec-in-issue-description.md:6` | Names superpowers as the framework whose file layout the ADR rejects | stays: ADR cites its source (ADR-0009 allows naming) |
| 12 | `docs/adr/0008-spec-in-issue-description.md:7` | Continued | stays: as above |
| 13 | `docs/adr/0008-spec-in-issue-description.md:61` | Credits `verification-before-completion` as the source of the per-criterion check | stays: attribution |
| 14 | `docs/plans/2026-08-05-bootstrap-clis.md:3` | Archived plan header | stays: archive |
| 15 | `docs/plans/2026-08-05-bootstrap-clis.md:7` | Archived plan, old spec path | stays: archive |
| 16 | `docs/adr/0009-no-external-skill-references.md:3` | The ADR's opening: what the plugin started as | stays: the ADR that defines the rule |
| 17 | `docs/adr/0009-no-external-skill-references.md:17` | Definition of a call | stays: as above |
| 18 | `docs/adr/0009-no-external-skill-references.md:18` | Definition of a call | stays: as above |
| 19 | `docs/adr/0009-no-external-skill-references.md:32` | Exempt paths, archive provenance | stays: as above |
| 20 | `docs/adr/0009-no-external-skill-references.md:48` | Rejected option: match bare names | stays: as above |
| 21 | `docs/adr/0009-no-external-skill-references.md:53` | Rejected option: forbid the old path | stays: as above |
| 22 | `scripts/types/external-references.ts:10` | The regex | stays: the guard |
| 23 | `scripts/types/render-schema.test.ts:112` | Enum fixture `["superpowers", "matt-pocock", "manual"]` from the old implementation-mode menu | stays: a fixture, not a call; cosmetic rename possible when the file is next touched |
| 24 | `scripts/types/render-schema.test.ts:120` | Rendered form of the same fixture | stays: as above |
| 25 | `scripts/validate-external-references.ts:15` | The validator's OK message | stays: the guard |
| 26 | `scripts/types/external-references.test.ts:10` | Test name | stays: fixtures of the guard (exempt) |
| 27 | `scripts/types/external-references.test.ts:12` | Fixture with a call | stays: as above |
| 28 | `scripts/types/external-references.test.ts:16` | Assertion on the call | stays: as above |
| 29 | `scripts/types/external-references.test.ts:19` | Test name | stays: as above |
| 30 | `scripts/types/external-references.test.ts:21` | Fixture with two calls | stays: as above |
| 31 | `scripts/types/external-references.test.ts:29` | Test name: prose is not a call | stays: as above |
| 32 | `scripts/types/external-references.test.ts:32` | Prose fixture | stays: as above |
| 33 | `scripts/types/external-references.test.ts:33` | Prose fixture | stays: as above |
| 34 | `scripts/types/external-references.test.ts:40` | Fixture for the exempt-path test | stays: as above |

Two things the grep does not measure and this review did: the `/grill-me` menu item in `new-project-workflow` (section 1), and the vocabulary the plugin inherited. Terms such as "grilling", "seam", "tracer bullet" and the three-condition ADR test are Matt Pocock's words, used with attribution in the research; the skills use them as the plugin's own language now. That is what the 2026-10-07 licence note intended, and nothing in the skills reproduces a list close enough to its source to need a copyright line.

## 4. Code review of PR #52, #55, #56, #57, #58 and the current state

Scope: the files the issue names (`tdd`, `issue-workflow`, `issue-writer`, `auto-issue-mode`, `workflows/review-verify.js`, the `review-*` agents, the schemas in `workflow-graph.json`, the evals), read in their current state after PR #61 (DEMO-376) and #62 (DEMO-377), with the five diffs for what was added when. Verdict values: **fixed here** (prose only, no behaviour change), **new issue** (draft in section 7), **rejected** (reason).

| # | Location | Severity | Finding | Proposed fix | Verdict |
|---|---|---|---|---|---|
| F1 | `workflows/review-verify.js:409`, `scripts/lib/island-reducer.ts:397` | major | A finding with two cast votes out of three (one sceptic returned nothing) is verified or rejected like a full vote and no gap is recorded. The rule "fewer than 2 votes drops the finding" is honoured, but a single dead sceptic leaves no trace in `stats` or `gaps`. The repository's own principle is that degradation is visible, never silent. | Push a gap (`finding file:line verified on 2 of 3 votes`) whenever `cast.length < VOTES`, in both the script and the reducer, with a reducer test. | new issue (P1) |
| F2 | `workflows/review-verify.js:419`, `scripts/lib/island-reducer.ts:409` | minor | `confidence` is `high` whenever no refutation was cast, including the two-vote case of F1; a finding one sceptic never looked at reports the same confidence as a 3-0 vote. | `high` only with every vote cast and none refuting; otherwise `medium`. | new issue (P1) |
| F3 | `workflows/review-verify.js:231` against `workflows/review-verify.js:394` and `agents/review-sceptic.md:17` | major | The spec-compliance mapper must report an unmet criterion "anchored to the diff line that misses it". An omission has no such line, so the mapper picks one, and the sceptics are told to refute a finding that is "not at the stated location" or "not introduced by this change". The axis that exists to catch missing work is the one whose findings the verification rule is most likely to kill. | Let a spec-compliance finding anchor to the file that should carry the criterion (line 0 or the file's first line) and tell the sceptics that location and introduction do not apply to an omission claim; count omissions in the mapper instructions as first-class. | new issue (P2) |
| F4 | `skills/auto-issue-mode/SKILL.md:135` | major | Stage 4 asks one subagent to review along the four axes and fix "every real defect". No sceptics, no judge, no `stats`, no `gaps`: the autonomous path, the one with the least human attention, gets the weakest review the plugin has. The user-steered path runs the island. | Stage 4 runs `review-verify` (the `Workflow` tool, or the Task fallback) on the issue branch and fixes only verified findings, carrying `stats` and `gaps` into the final report. | new issue (P3) |
| F5 | `workflows/review-verify.js:321-371, 403-420, 474-496` against `scripts/lib/island-reducer.ts:234-284, 382-422, 334-380` | minor | The reducer logic exists twice (script and library) with no parity test; only the schema literals have a drift check. Read side by side today the three blocks are line-for-line equivalent. | Fixture-based parity test is not possible without extracting the script's reducer, which the Workflow runtime forbids (no imports). Keep the duplication; re-check it whenever either file changes. | rejected: accepted duplication (decision 2026-08-11), verified equal in this review |
| F6 | `scripts/types/evals.ts:20-37` | minor | The evals validator reads `data.skill_name.trim()` and `evalCase.assertions.length` without checking they exist: a file missing a field crashes with a TypeError instead of a validation error; `expected_output` and `files` are never checked; `skill_name` is not compared with the directory name. Same class as the 2026-08-11 lesson ("the validator trusts the shape it was handed"). | Guard every field, report each as an error, assert `skill_name` equals the skill directory. | new issue (P6) |
| F7 | `skills/issue-workflow/SKILL.md:609` | minor | The related-skills list calls `auto-issue-mode` "the one place the agent writes `in-progress` itself" and, one bullet later, says `issue-next-step` may write it too. | Drop "the one place"; name both exemptions. | new issue (P5): a skill text change needs a version bump, which the spec of this issue excludes |
| F8 | `CONTEXT.md:339` | minor | The glossary entry **Passive metric** says "The repo has no CI and no telemetry". `.github/workflows/validate-plugin.yml` has run on every pull request since DEMO-376. | "The repo has no telemetry and its CI runs validators only". | fixed here |
| F9 | `docs/USER-GUIDE.md:78` | minor | "Observability (metrics for the graph itself) is the one principle still open here - tracked as an explicit pending decision". It was decided: three passive figures, documented in `docs/ARCHITECTURE.md` and the **Passive metric** term. | State the decision and point at the architecture document. | fixed here |
| F10 | `docs/USER-GUIDE.md:89` | minor | "No CI required - this repo runs its validators locally", in the section telling readers how to copy the approach; the repo now runs guards in CI. | Say CI is optional and that this repo runs its guards there as well. | fixed here |
| F11 | `workflow-graph.json:6, 438, 598, 1022, 1097` | minor | The contract is tracker-neutral since DEMO-300, but its prose is not: "Nothing is written to Linear before the user approves", "The plan posted to Linear", "the Linear magic word", "The human sets the issue to In Progress in Linear". The generated templates and the `plan-gatherer` prompt inherit the wording; a GitHub Issues user reads a plan template that says Linear. | Reword to "the tracker"; regenerate the three templates; bump. | new issue (P5) |
| F12 | `skills/new-project-workflow/SKILL.md:263, 288` | minor | The spec-skill menu offers `/grill-me` (and names `/grill-with-docs`) as a manual item. Not a call, so the validator passes, but the decision of 2026-10-07 ("no borrowed practice stays external") is not met here until the `grill` skill replaces the item. | Replace item 4 with the plugin's `grill` skill when it lands; until then the menu text is correct about what it is. | new issue (P8, part of the grill skill) |
| F13 | `.github/workflows/validate-plugin.yml` | major | CI runs the four release guards (manifests, external references, human docs, `claude plugin validate`) and nothing else. The 323 tests, `validate-workflow-graph` (the contract and the drift check), `validate-evals`, `validate-cli-dependencies` and `validate-platform-config` run only when a contributor remembers. A pull request that breaks the contract or hand-edits a generated template is green in CI. `docs/CONTRIBUTING.md:59` describes this accurately, which does not make it right. | Add `node --test 'scripts/**/*.test.ts'` and the four validators to the workflow; update the sentence in CONTRIBUTING. | new issue (P4) |
| F14 | `workflows/review-verify.js:186-187, 501-502` and the other 23 comment lines; `workflows/plan-context-fanout.js` (23 comment lines) | minor | Standard 1 allows a comment only for a constraint the code cannot express. The comments on the schema literals (the runtime cannot read the contract), the intermediate shapes (must not carry the `SCHEMA_` prefix) and the string-encoded `args` (an observed harness quirk) are such constraints. The comments on the synthesizer ("so no model can mutate or add a finding") and on the reducer ("plain code, no agents") explain design intent that CONTEXT.md and ARCHITECTURE.md already carry. | Leave them: the scripts are the one place a reader lands without the glossary, and the lines name constraints the drift check and the runtime impose. | rejected: within standard 1's exception; the two intent comments are a judgement call at most |
| F15 | `agents/review-judge.md:15`, `workflows/review-verify.js:460` | minor | The judge's schema still offers every colliding axis as a verdict, including the non-security ones in a security conflict; the reducer then discards such a verdict as a gap. The agent text tells the judge the rule, so the model is asked to pick from options it is told not to pick. | None: the decision (DEMO-382, recorded in the **Review judge** term) is that the reducer, not the prompt, enforces the rule, so a wrong verdict is counted rather than hidden by a narrower enum. | rejected: deliberate, documented |
| F16 | `skills/tdd/SKILL.md` as a whole | none | The skill is the research's take-list made operational: verify red, name the break, tautological test as a defect, vertical slices, boundary mocking, the command-output-claim order, the recorded exit. It reads as the plugin's own text and does not restate superpowers' iron law or Matt Pocock's seam negotiation. No defect found. | none | none |
| F17 | `skills/tdd/evals/evals.json` | minor | Four cases with behavioural assertions; good. Nothing runs them: no local runner, no CI step, and 13 of 15 skills have no evals at all. `issue-workflow`'s dispatch table, `issue-start`'s three preconditions and `issue-close`'s stop conditions are the behaviours a regression would hurt most and have no eval. | A runner (Claude Code ships `claude plugin eval`) and evals for the dispatch table and the two chains. | new issue (P6) |
| F18 | `workflow-graph.json`, `ImplementationPlan.testApproach` | none | The schema change of PR #55 (mode, seams, reason) and the generated templates are consistent with `tdd`, `issue-workflow` step 5 and `auto-issue-mode` stage 3; the no-reason case stops in `issue-workflow` and is reported in `auto-issue-mode`. No defect. | none | none |
| F19 | `workflows/review-verify.js:434`, `scripts/lib/island-reducer.ts:292-304` | none | Conflict detection (group per anchor, more than one axis) and `applyJudgments` (invalid verdict keeps all, security never overruled, `stats.verified` counted after the judge) match the DEMO-381 and DEMO-382 decisions and the glossary. `island-reduce.ts review judgments` is run unconditionally so `stats.overruled` is always stamped. No defect. | none | none |

The 2026-10-08 plan update cited PR #59 as DEMO-376; PR #59 is DEMO-213 and DEMO-376 is PR #61. The review used #61.

## 5. Gap table

### The rules a gap is measured against

A feature is **compatible with the flow** only if it fits all of these, written down here so the category is checkable:

1. The tracker is the only carrier of the spec and the plan (ADR-0008). The repository holds code. No plan file, spec file, ledger, handoff folder or decision log in the repository or in a git-ignored directory of it.
2. The issue's phase on the tracker steers the agent; `in-progress` is written by the human (or recorded after an explicit instruction in chat); `done` only through `issue-close`.
3. Human gates are external state between islands, never inside one; a spec change, a file outside the plan and a tracker write all wait for the user's yes in chat (`frozenRules`).
4. One issue, one branch, one draft PR with the magic word; a merge commit; no stacked PRs; sequential writers by default.
5. Atomic commits with Polish messages in noun form; no code comments beyond constraints the code cannot express; repo content in English; LF.
6. Workflow islands with a deterministic reducer, declared widths, counted degradation; the main agent stays conversational.
7. Passive metrics only: a figure counted from what a run already emitted and stored in the run's own tracker comment.
8. Independence: no call to another plugin's skill; a practice on the issue path is the plugin's own text.

**Compatible with the flow** gets a recommendation and an issue draft (section 7). **Outside the flow** collides with one of the rules above and gets one sentence on what it does and why it may be worth attention, without a recommendation. **Rejected** gets a reason.

### Compatible with the flow

| # | Feature | Source | Recommendation | Draft |
|---|---|---|---|---|
| C1 | Grilling in rounds: ask the whole frontier of answerable questions per round, numbered, each with a recommended answer worded so that "yes" accepts it; look facts up without blocking the round | Matt Pocock `grilling` 1.3 | Replace "one question at a time" in the inline protocol (`issue-workflow` 1a, `issue-writer`, `new-project-workflow`) with rounds over the decision tree. Fewer turns, same gate on shared understanding. Belongs to the `grill` skill. | P8 |
| C2 | Say the size classification out loud before the first question so the human can override it; only ratchet up mid-task | superpowers `brainstorming` 6.3 | `issue-writer` step 2 and `issue-workflow` 0c already pick minimal or full silently; one sentence announcing the pick costs nothing and removes the "it looked small" failure. | P8 |
| C3 | Seam notes: every proposed seam carries one line on what it catches and what it misses | Matt Pocock `tdd` 1.3 | Change the description of `ImplementationPlan.testApproach.seams` in the contract and regenerate the plan template; `tdd` reads the note as the break it must name. | P9 |
| C4 | Review focus: the input classes the spec implies but no test exercises, listed once in the plan; proportion: a plan longer than the code it describes has written the code | superpowers `writing-plans` 6.4.2 | A `reviewFocus` list on `ImplementationPlan` that the `correctness-regressions` mapper receives with the range, plus a self-review line in planning. The proportion rule as one sentence in `issue-workflow` step 1. | P9 |
| C5 | Standards files search: the standards axis lists every file documenting how code is written; `CODING_STANDARDS.md` and `CONTRIBUTING.md` must be on it | Matt Pocock `code-review` 1.3 | The `repo-standards` prompt reads only `CONTEXT.md` `## Standards`; in a client repository that file does not exist and the axis falls straight to the smell baseline. Search for the usual standards files first, then the baseline. | P10 |
| C6 | PR body for human reviewers: summary as a sketch, before/after evidence, merge danger (one-way or two-way door, blast radius), verification; the one fact the change is safe because of, proven by running code | Matt Pocock `pr`; pstack `opening-a-pr` playbook and `blast-radius` | The draft PR body is `Fixes <ID>` plus a paragraph. For the client repositories this is the only text the other developers read. Write the body at `pr.mark-ready` time from the criteria table and the review stats, in the audience rule of the user's global CLAUDE.md. | P11 |
| C7 | Rule table: every coding rule paired with what enforces it; a mechanical rule gets a deterministic check, docs are for judgement calls only | pstack `correct`; Matt Pocock `retro` 1.3 | `CONTEXT.md` `## Standards` already names a guard for rules 7, 8 and 9 and none for 1 to 6. Add an enforcer column (validator, test, review axis) and build the cheap missing checks (comments in `scripts/` and `workflows/`, English-only text). | P12 |
| C8 | Retrospective on a session: candidates for environment and skill improvements by category (navigation pointers, automated checks, coding standards, tool economy, no-ops, information access), each presented, never auto-applied | Matt Pocock `retro`; pstack `reflect`; superpowers `diagnosing-superpowers` | A user-invoked `retro` skill that reads the session (passive: transcripts the run already produced) and hands every accepted candidate to `issue-writer` as a draft. The output is issues on the tracker, nothing in the repository. | P13 |
| C9 | Sub-issue blocking edges: tickets attached as sub-issues of the source issue with native blocking links; a human-or-unattended tag per slice | Matt Pocock `to-tickets` 1.3; adopted in the 2026-10-06 decisions table and not implemented | An `issue.add-relation` operation per tracker adapter and a "blocked by" line in `issue-writer` step 3; the tag tells `auto-issue-mode` which slice it may take. | P14 |
| C10 | Cheaper orchestrator: run the coordination of a multi-stage run one layer down on a mid-tier model, since the controller only reads reports | superpowers `claude-code-tools` 6.4 | `auto-issue-mode` is the controller; its turn runs on the session model. A `model: sonnet` frontmatter line on the skill moves the coordination to Sonnet while every stage keeps its own model. Measure once with the run's final report. | P15 |
| C11 | Debugging refinements: redact secrets before showing a command or artifact; prove a forced mutation landed before trusting a red | Matt Pocock `diagnosing-bugs` 1.3 | Two lines for the `debug` skill of DEMO-380; no own issue. Recorded as a comment on DEMO-380 (section 8). | DEMO-380 comment |

### Outside the flow

One sentence each. None of these appears in the recommendations or in section 7.

- **Rulings ledger** (superpowers `executing-plans` and `subagent-driven-development` 6.4): the agent rules on plan defects and conflicts itself, writes a `Ruling:` line with the cost if wrong into a git-ignored ledger file, and only four classes of action stop it; it collides with the chat-approval gates on spec change and on files outside the plan, and with the no-files rule, but its insistence that every deviation is written down with its cost is the sharpest statement of what our plan-extension comments are for.
- **Decision trail file** (pstack `show-me-your-work`): a TSV log of decisions in the work directory, audited against the transcript at the end of the run and read by a reviewer on another model family; a file-based record outside the tracker thread, worth attention for its audit step, which checks that the log told the truth rather than trusting it.
- **Integration-branch swarm** (Matt Pocock `implement-spec` 1.3): implementer subagents per ticket in their own worktrees, a merger subagent onto one integration branch, new implementers started as the frontier opens; parallel writers and one PR for many tickets, against one issue, one branch, one PR and sequential-by-default.
- **Orchestrate and autopilot playbooks** (pstack `poteto-mode`): a standing coordinator chat running a multi-day program of stacked PRs with fleets of subagents, babysit and shipping loops that land a verified stack bottom-up; autonomy far beyond one issue, built on stacked PRs the plugin rejected.
- **Benny automations** (pstack `automations/benny`): Slack issue reports triaged, deduplicated against the tracker, filed as tickets and reproduced into draft PRs by an automation; tracker writes and PRs without a human approval in chat.

### Rejected

| Feature | Source | Reason |
|---|---|---|
| Host references for Hermes, Muse, Devin, OpenCode | superpowers 6.3 to 6.4 | Hosts the plugin does not target; Claude Code, Cursor and Agent Skills readers are the audience. |
| Refused-worktree-removal handling | superpowers `finishing-a-development-branch` 6.4 | The flow has no worktrees. |
| "Declined to judge" list in the reviewer, ruled on by the executor | superpowers `requesting-code-review` 6.4 | A finding is a claim with evidence that sceptics can refute; a list of set-aside behaviours is not refutable and would travel outside `stats` and `gaps`, which already make what the review did not cover visible. |
| No-subagents contract for implementers and reviewers | superpowers SDD 6.4 | Enforced structurally: the island agents have a tool whitelist without `Agent`; `auto-issue-mode` stages are one subagent each. |
| Batching small same-shape tasks into one dispatch; bounded waiting on children | superpowers SDD 6.4 | Implementation is sequential in the main agent; the islands batch by construction (`BATCH = 8`). |
| `CONTEXT.md` renamed to `GLOSSARY.md` | Matt Pocock 1.3 | Our `CONTEXT.md` carries `## Standards` (the rule source of a review axis) and `## Language`; the name is wired into prompts, the validator and the docs. The future `model-domain` skill writes to `CONTEXT.md` `## Language`, not to a `GLOSSARY.md`. |
| `wizard`: a bash wizard for human-only setup steps | Matt Pocock 1.3 | Off the issue path; `bootstrap-clis` already hands back the only human-only steps the plugin has (authentication). |
| `wait-what`, `bro`, `teach`, `chief-of-staff`, `writing-shape`, `writing-beats`, `writing-fragments`, `ask-matt`, `to-questionnaire`, `handoff` | Matt Pocock; pstack | Off the issue path. |
| `SCOPE.md` and `.out-of-scope/` records | Matt Pocock 1.3 | The decisions table of the earlier research and the ADRs already record every rejection with its reason; a third place would split them. |
| `writing-for-agents` as a shipped reference | Matt Pocock 1.3 | Its levers (pointers, pruning, no-ops, leading words) are useful to the maintainer, not to the plugin's users; applied once in P7 rather than carried as a skill. |
| The 22 principle skills and the `poteto-mode` router with 23 playbooks | pstack | Decided in the earlier research: too many triggers; the useful rules are folded into the practice skills and the standards. |
| `interrogate`, `arena`, `setup-pstack` per-role models, cross-model trail review | pstack | Model diversity per seat and per-role model config were rejected on 2026-10-06; independence by rule source is the plugin's answer. |
| `swarm` | pstack | The islands are the plugin's fan-out, with a reducer in code. |
| `recall`, `session-pickup`, `pause-safely` | pstack | `project-continue`, the `## Checkpoints` entry and the session summary cover resume and pause; a pause in this flow is a session summary. |
| `create-verification-skill`, `maintain-verification-skill`, `benchmark-checklist`, `explain-the-number`, `hillclimb`, perf and forensics playbooks, `visual-parity` | pstack | No running application and no performance work in this repository; revisit if the plugin gains an app (as the earlier research already notes). |
| `no-comments` and the Comment Sicko agent | pstack | Standard 1 and the `repo-standards` axis; a deterministic check is part of P12, not a separate agent. |
| `how`, `why`, `teach`, `automate-me`, `make-bot-ui`, `typescript-best-practices`, `technical-writing`, `unslop` | pstack | Off the path or covered: codebase questions go through plain reads (user CLAUDE.md), human docs through `nerd-documentation-write`, preferences through the user CLAUDE.md and nerdbrain. |
| Fetch the ticket by reference and state its title | Matt Pocock `implement` 1.3 | Covered: `issue.read` opens every phase. |
| "A red test you saw and did not report is a falsified report" | superpowers `test-driven-development` 6.4 | Covered: `tdd` runs the full suite in the check beat; `auto-issue-mode` stage 3 names pre-existing failures separately. |
| `Spec:` pointer in the plan header | superpowers `writing-plans` 6.4 | The plan is a comment on the issue whose description is the spec; the pointer is the thread. |
| Spec file written by the architectural path | superpowers `brainstorming` 6.3 | ADR-0008. |

## 6. The plugin on its own terms

Improvements that have nothing to do with parity, found while reading: ergonomics, token cost, evals, dead paths, inconsistencies between the skills and the docs.

- **Token cost of `issue-workflow`.** 620 lines, loaded on every turn that touches an issue, in every session. Roughly a third of it is the Cursor manual-island recipe (two stage-by-stage procedures that only run when `Workflow` is absent) and the degradation notes repeated for both islands. Matt Pocock's `writing-for-agents` names the failure: sprawl, every line live and the document too long. Move the manual recipes into a reference file next to the skill, loaded only on the Task path; state each degradation once. (P7)
- **Evals exist for two skills and nothing runs them.** F17. (P6)
- **CI does not run the tests.** F13. (P4)
- **The autonomous path has the weakest review.** F4. (P3)
- **Silent sceptic loss.** F1 and F2. (P1)
- **Omissions cannot survive verification.** F3. (P2)
- **The contract speaks Linear.** F11 and F7. (P5)
- **`new-project-workflow` is the odd one out.** 350 lines, its own grilling copy, a menu of external spec skills with `/grill-me` still in it, and a Linear project created by hand while the rest of the plugin went through adapters. It is the one skill the independence work has not reached. (P8 covers the menu; the adapter rewiring is DEMO-330 territory and is not drafted here.)
- **Dead-path candidates checked and cleared.** The `prior-plans` gatherer reads `docs/plans/`, which is an archive of two files here and absent in client repositories; its row in the last fan-out stats (`prior-plans 9/9`) shows it also reads merged PRs, so it is not dead. The `docs/specs/` directory is read by nobody and is an archive only, as ADR-0009 says.
- **Practice skills.** DEMO-380 is Done on the tracker since 2026-10-07 with no PR, no commit and no skill in the repository. The decisions of 2026-10-07 ("no borrowed practice stays external", "grilling sessions are checkpointed and resumable") still name it as the carrier. Either reopen it or file the four skills as new issues; P8 is the first of them.

## 7. Proposed issues

Drafts only. None exists on the tracker until the user accepts it in chat; they are meant as standalone issues, not sub-issues of this review (the review ends with this document). Each has a title, a goal and at least one acceptance criterion with its check. Ordered by the verdict in section 1.

**P1. Visible sceptic degradation in the review island**
Goal: a finding verified on fewer than three cast votes is counted and shown, in both hosts.
- A finding with two cast votes adds a gap naming the file, line and vote count; `confidence` is `high` only with three cast votes and no refutation, check: `node --test scripts/lib/island-reducer.review.test.ts` with a fixture of one null vote.
- `workflows/review-verify.js` matches the reducer, check: `node scripts/validate-workflow-graph.ts` (drift) and a read of both blocks side by side in the review.

**P2. Spec-compliance findings for omissions**
Goal: an unmet acceptance criterion can be reported and verified even when no diff line carries it.
- The spec-compliance mapper may anchor an omission to the file that should implement the criterion with line 0, and the sceptic prompt says that "not at the stated location" and "not introduced by this change" do not refute an omission, check: review a branch whose issue has one deliberately unmet criterion; the finding survives with `stats.verified` 1.
- The reducer accepts line 0 as well-formed, check: reducer test.

**P3. auto-issue-mode reviews through the review island**
Goal: the autonomous run gets the same review as the user-steered one.
- Stage 4 runs `review-verify` on the issue branch (Workflow, or the Task fallback with `island-reduce.ts`) and fixes only verified findings, check: a run's final report carries `stats` and `gaps` from the island.
- The stage's subagent prompt forbids dispatching its own reviewer, check: read of the skill.

**P4. CI runs the test suite and the contract validators**
Goal: a green pull request means the contract, the templates and the tests hold.
- `.github/workflows/validate-plugin.yml` runs `node --test 'scripts/**/*.test.ts'`, `validate-workflow-graph`, `validate-evals`, `validate-cli-dependencies`, `validate-platform-config`, check: a pull request that hand-edits `plan-template.md` fails CI.
- `docs/CONTRIBUTING.md` says what CI runs, check: read.

**P5. Tracker-neutral wording in the contract and the related-skills list**
Goal: nothing a GitHub, GitLab or Azure DevOps user reads says Linear where it means the tracker.
- `workflow-graph.json` frozen rules, gate descriptions and schema descriptions say "the tracker"; the three templates are regenerated, check: `rg -n 'Linear' workflow-graph.json skills/*/*-template.md` lists only the `linear` config block.
- `skills/issue-workflow/SKILL.md` names both `in-progress` exemptions instead of "the one place", check: read. Version bump.

**P6. Evals: a runner and coverage of the dispatch and the chains**
Goal: the behaviours a regression hurts most are checked by an agent, not by grep.
- Evals for `issue-workflow` (phase dispatch, unknown phase, the in-progress gate), `issue-start` (three preconditions) and `issue-close` (merge failure stops), check: `node scripts/validate-evals.ts` lists five skills.
- A documented way to run them (`claude plugin eval` or equivalent) in `docs/CONTRIBUTING.md`, check: one recorded run of the `tdd` suite with its report.
- `scripts/types/evals.ts` reports a missing field as an error and checks `skill_name` against the directory, check: tests with malformed fixtures.

**P7. Prune issue-workflow**
Goal: the skill loaded on every issue turn carries only what every turn needs.
- The Cursor manual-island procedures move to a reference file the skill points at from the Task path; each degradation note appears once, check: `wc -l skills/issue-workflow/SKILL.md` under 400 with no step removed, compared against a checklist of its headings before and after.
- Behaviour unchanged, check: the `tdd` and `new-project-workflow` evals pass; a full issue run on this repository.

**P8. The grill skill, in rounds**
Goal: one grilling protocol, the plugin's own, replacing the three inline copies and the `/grill-me` menu item.
- `skills/grill/SKILL.md` asks in rounds over the decision tree (the frontier per round, numbered, a recommended answer each, "yes" accepts it), looks facts up itself, announces the size classification out loud, and ends on confirmed shared understanding, check: an eval with a three-decision topic finishes in at most two rounds.
- `issue-writer`, `issue-workflow` 1a and `new-project-workflow` call `nerdway:grill`; the `/grill-me` and `/grill-with-docs` mentions are gone, check: `rg -n 'grill-me|grill-with-docs' skills` empty.
- Checkpointing of a session (decision of 2026-10-07) is designed in the plan: the carrier is a tracker comment when the issue exists and the chat otherwise, check: plan comment.

**P9. Seam notes and review focus in the plan**
Goal: the plan says what each seam catches and what the review should look at.
- `ImplementationPlan.testApproach.seams` items carry a catches-and-misses note (schema description, regenerated template), check: `node scripts/render-templates.ts` and the drift test.
- `ImplementationPlan.reviewFocus`: the input classes the spec implies and no test exercises; the `correctness-regressions` mapper receives it with the range, check: a review run where a listed input class yields a finding.

**P10. Standards files in the repo-standards axis**
Goal: the axis reads what a client repository actually documents.
- The mapper searches for `CONTEXT.md` `## Standards`, `CODING_STANDARDS.md`, `CONTRIBUTING.md` and the like before falling back to the smell baseline, and names the file in each finding, check: a review on a repository with only `CONTRIBUTING.md` cites it.

**P11. PR body for human reviewers at mark-ready**
Goal: other developers get a PR description that stands on its own.
- At `pr.mark-ready` (`issue-close`, `auto-issue-mode` stage 4) the body is rewritten with: why, what changed, scope, evidence before and after from the criteria table, merge danger (one-way or two-way door, blast radius), verification from the review stats; no issue code except the magic word line, check: `gh pr view --json body` on a run.
- The text follows the audience rule of the user's global CLAUDE.md, check: read.

**P12. Standards table with an enforcer column**
Goal: every rule in `CONTEXT.md` `## Standards` says what enforces it.
- Each rule names a validator, a test or "review axis only", check: read.
- Rules 1 (no comments in `scripts/` and `workflows/`, with the constraint exception) and 2 (English-only skill bodies) get a validator in CI, check: `node scripts/validate-standards.ts` fails on a planted violation.

**P13. Retro skill**
Goal: a session's lessons become issues, not memory.
- `/retro` reads the current session, proposes candidates by category (navigation, automated checks, coding standards, tool economy, no-ops, information access), and hands each accepted one to `issue-writer`; nothing is written without approval, check: `linearis issues list --team DEMO` unchanged until the user accepts.

**P14. Sub-issue blocking edges**
Goal: `issue-writer` records which sub-issue blocks which, and which slice may run unattended.
- `issue.add-relation` in every tracker adapter (`—` where the tracker has none, with the "Blocked by" line as fallback), check: `node scripts/validate-workflow-graph.ts` (adapter operation list).
- `issue-writer` step 3 asks for blocking edges and an unattended tag when it proposes sub-issues, check: a created parent with two children shows the relation on the tracker.

**P15. Cheaper orchestrator for auto-issue-mode**
Goal: coordination costs a mid-tier model; stages keep theirs.
- `skills/auto-issue-mode/SKILL.md` carries `model: sonnet`; one run's final report shows the stages' models unchanged, check: the report plus the session's model line.

## 8. Where the findings go

- DEMO-376 (Done, PR #61): a comment pointing at section 3 (every remaining hit stays, the validator and its exemptions are complete) and at the two things the grep misses.
- DEMO-380 (Done, no work): a comment pointing at section 6 and P8, with the two `debug` refinements of C11 and the `CONTEXT.md` naming note of the GLOSSARY rejection.
- DEMO-377 (Done, PR #62): a comment with the three USER-GUIDE and CONTEXT.md corrections made on this branch (F8, F9, F10) and the Linear-centric wording that remains (F11, P5).
- The project entity page: a `## Decisions` entry with the verdict and a link to this file.
