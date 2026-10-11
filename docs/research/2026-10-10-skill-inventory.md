# Research: skill inventory for the whole issue lifecycle

Checked on 2026-10-10 on the author's machine, against the repository at `main` `5b1ddf5` (0.51.0). The earlier research answered narrower questions: `2026-10-06-sdd-patterns.md` (section "Practice decisions") rated the nine practices the plugin borrowed from superpowers and Matt Pocock, and `2026-10-08-framework-independence-review.md` checked that the repository no longer calls them. Neither asked what the framework needs across the whole lifecycle, skill by skill. This document does: every practice of the lifecycle gets a verdict, every installed skill is mapped to a practice or marked off-cycle, and every gap names the issue that closes it.

## 1. What this means

### The measure is progress, not coverage

Tables A and B measure how much of three other frameworks the plugin reproduces. That is the wrong bar for this plugin. Skill libraries of this kind are cheap to produce, and the number of skills says nothing about how well a framework carries real work. The plugin should be judged by the problems it solves that the analysed frameworks do not solve, or solve worse. A skill in table B is evidence that a practice exists; it is never on its own a reason to build one.

What the plugin already does that no skill in table B combines:

- **The issue is the whole record.** Spec, plan, spec changes, grilling state, session summaries and the review counts all live on one tracker issue, so any machine and any session resumes from the issue alone. Matt Pocock's `to-spec` publishes a spec to a tracker; nothing in table B keeps the plan, the decision history and the resume point there too.
- **A human moves the phase.** Implementation starts only after a person moves the issue to in-progress on the tracker; the agent never approves its own plan. The gate is visible to anyone who opens the board, not only to whoever is in the chat.
- **Review findings are verified and counted.** Every finding faces three sceptics, a rejection needs two refutations, and every dropped, unverified or overruled finding is counted in the result. A review cannot quietly lose findings.
- **Reduction is code.** The islands' reducers are plain functions, so the same agent outputs always reduce to the same context and the same findings.
- **One contract, many platforms.** Four trackers and three VCS hosts behind the same operation IDs and the same five phases.

The next steps should extend that line: more guarantees that work is not lost, approved silently or left unverified, rather than more practices copied from a list.

### The gaps, by the problem behind them

| Gap | Issue | Our own problem behind it |
|---|---|---|
| Detecting a stale plugin install or stale skill copies | DEMO-413 | Yes. On 2026-10-10 Claude Code ran 0.45.0 against 0.51.0, and Cursor loads June copies of four plugin skills; nothing signalled either. No skill in table B addresses this |
| Splitting work into stages with blocking edges | DEMO-407 | Yes. DEMO-380 was created as a child of the previous stage and closed automatically with it, with none of its work done |
| Receiving review comments from people and bots on the PR or MR | DEMO-414 | Yes. On client repositories colleagues review on GitLab and never see the tracker; their comments are the only review that reaches the code, and the flow never reads them |
| PR or MR body written for human reviewers | DEMO-410 | Yes. The same readers see only the PR body, which today is `Fixes <ID>` and one paragraph |
| Testing skills: an eval runner and coverage of the core skills | DEMO-412 | Yes. A regression in phase dispatch or in a gate would surface only in a real session |
| Session retrospective that turns lessons into issues | DEMO-411 | Partly. The rule that a lesson becomes a tracker issue is ours; the shape of the skill comes from pstack and needs its own justification |
| Debugging (`debug`) | DEMO-405 | Yes, named by the grilling session of 2026-10-11 (the three skills of DEMO-405 came from the 2026-10-06 decision to take practices from superpowers and Matt Pocock, with no problem of ours behind them). A test or validator that is red for an unknown reason has no owner in the flow: `tdd` only says the red step must be red for the named reason, `auto-issue-mode` stops on "tests are red after stage 4" with no method in between, and Claude Code has no Debug Mode. Eight DEMO issues labelled Bug were run down the feature path. The skill is built narrowly, around that seam |
| Parallel subagent dispatch (`dispatch-agents`) | DEMO-405 | No. In about 259 Claude Code sessions on this machine all 42 `Agent` calls were `auto-issue-mode` stages; there was no ad hoc parallel dispatch to own. Fan-out lives in the islands (code) and in the stages of `auto-issue-mode`. Skip, settled by the grilling session of 2026-10-11 |
| Domain modelling (`model-domain`) | DEMO-405 | Partly, and not as a skill. `CONTEXT.md ## Language` is maintained by hand (12 commits in three days), the "glossary term" tag of `grill` has no executor, and three terms (Island host, Script binding, Self-contained schema) appear nowhere outside `CONTEXT.md`. The answer is a step, not a skill: `issue-workflow` and `issue-writer` turn the tag into an acceptance criterion checked by `validate-context-terms`, a validator that fails on a term nothing else uses. Settled by the grilling session of 2026-10-11 |

Everything else in table A is either covered by a plugin skill (**have**) or deliberately left out (**skip**) with the reason in the row. No practice is a thin overlay: the two candidates, worktrees and skill authoring, are served by host built-ins that need no plugin context around them, so an overlay would add text without solving a problem.

### Order, and when superpowers can go

Superpowers is still enabled on this machine and, through its session hook, fills two of these gaps today: debugging and acting on review comments (subagent dispatch left the list with the grilling verdict above). It can be disabled once DEMO-405 and DEMO-414 are closed, not before. Suggested order: DEMO-413 and DEMO-407 first (each fixes an incident that already happened), then DEMO-414 and DEMO-410 (client repositories), DEMO-412, DEMO-405 after its grilling session, DEMO-411 last.

## 2. Sources

Generated, not recalled. The command below lists every skill this document maps in table B; its output on 2026-10-10 was 157 lines.

```bash
{
  find ~/.claude/plugins/cache/superpowers-marketplace ~/.claude/plugins/cache/mattpocock ~/.cursor/plugins/cache/cursor-public/pstack -name SKILL.md \
    | sed -E 's#^.*/cache/([^/]+)/([^/]+)/[^/]+/(.*/)?([^/]+)/SKILL.md$#\1\t\2\t\4#'
  find -L ~/.agents/skills -mindepth 2 -maxdepth 2 -name SKILL.md \
    | sed -E 's#^.*/\.agents/skills/([^/]+)/SKILL.md$#agents\tagents-skills\t\1#'
} | sort -u
```

| Source | Host that loads it | Revision | Skills |
|---|---|---|---|
| superpowers | Claude Code (enabled) | 6.2.0 | 14 |
| superpowers-developing-for-claude-code | Claude Code (installed, disabled) | 0.3.1 | 4 |
| superpowers-lab | Claude Code (installed, disabled) | 0.5.0 | 4 |
| superpowers-chrome | Claude Code (installed, disabled) | 3.0.1 | 1 |
| mattpocock-skills | Claude Code (installed, disabled) | 1.2.0 | 41 |
| pstack | Cursor (`cursor-public`) | `d0ef80d` | 54 |
| `~/.agents/skills` | Cursor (user-level skills directory) | not versioned | 39 |

The other installed plugins get one row each. They were listed with:

```bash
for host in claude cursor; do
  for dir in ~/."$host"/plugins/cache/*/*/; do
    marketplace=$(basename "$(dirname "$dir")"); plugin=$(basename "$dir")
    case "$marketplace/$plugin" in superpowers-marketplace/*|mattpocock/*|cursor-public/pstack|nerd4rent-claude-plugin/nerd4rent) continue;; esac
    printf '%s\t%s\t%s\t%s\n' "$host" "$marketplace" "$plugin" "$(find "$dir" -name SKILL.md | wc -l | tr -d ' ')"
  done
done
```

| Host | Plugin | Skills | Verdict |
|---|---|---|---|
| Claude Code | `anthropic-agent-skills/claude-api` | 18 (one shared tree) | off-cycle: Claude API reference |
| Claude Code | `anthropic-agent-skills/document-skills` | 18 (one shared tree) | off-cycle: document formats (docx, pdf, pptx, xlsx) |
| Claude Code | `anthropic-agent-skills/example-skills` | 18 (one shared tree) | off-cycle: example skills; its `skill-creator` is counted under A33 |
| Claude Code | `claude-code-warp/warp` | 0 | off-cycle: terminal integration |
| Claude Code | `gitkraken/gitkraken-hooks` | 0 | off-cycle: git client integration |
| Claude Code | `linear-skills/gitlab-to-linear` | 1 | off-cycle: one-off GitLab import, a separate flow |
| Claude Code | `linear-skills/linear-cli` | 1 | off-cycle: the Linear adapter calls `linearis` directly |
| Cursor | `claude-plugins-official/github` | 0 | off-cycle: service connector |
| Cursor | `claude-plugins-official/gopls-lsp` | 0 | off-cycle: language server |
| Cursor | `claude-plugins-official/jdtls-lsp` | 0 | off-cycle: language server |
| Cursor | `claude-plugins-official/kotlin-lsp` | 0 | off-cycle: language server |
| Cursor | `claude-plugins-official/linear` | 0 | off-cycle: service connector |
| Cursor | `claude-plugins-official/lua-lsp` | 0 | off-cycle: language server |
| Cursor | `claude-plugins-official/php-lsp` | 0 | off-cycle: language server |
| Cursor | `claude-plugins-official/rust-analyzer-lsp` | 0 | off-cycle: language server |
| Cursor | `claude-plugins-official/typescript-lsp` | 0 | off-cycle: language server |
| Cursor | `cursor-public/1password` | 1 | off-cycle: service connector |
| Cursor | `cursor-public/context7-plugin` | 1 | off-cycle: service connector |
| Cursor | `cursor-public/gmail` | 0 | off-cycle: service connector |
| Cursor | `cursor-public/google-calendar` | 0 | off-cycle: service connector |
| Cursor | `cursor-public/google-drive` | 1 | off-cycle: service connector |
| Cursor | `cursor-public/linear` | 0 | off-cycle: service connector |
| Cursor | `cursor-public/outlook` | 0 | off-cycle: service connector |
| Cursor | `cursor-public/slack` | 8 | off-cycle: service connector |
| Cursor | `cursor-public/wispr-flow` | 0 | off-cycle: service connector |

Host built-ins that touch the lifecycle were taken from the Claude Code session's command list and from Cursor's documentation (skills, modes, Bugbot, worktrees pages, read 2026-10-10):

- Claude Code: plan mode, worktrees (`EnterWorktree`, `--worktree`), `/code-review`, `/security-review`, `/simplify`, `/init`, the `skill-creator` skill, `claude plugin eval`.
- Cursor: Plan Mode, Debug Mode (hypotheses plus instrumentation logs, removed after the fix), `/review` and `/review-bugbot` (local Bugbot run against the base branch), Bugbot on PRs, `/worktree` and `/best-of-n`, `/create-skill`.

One fact from Cursor's skills page matters below: Cursor loads user-level skills from `~/.cursor/skills`, `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills`. Claude Code does not read `~/.agents/skills`.

## 3. Lifecycle (table A)

Verdicts: **have** (`nerd4rent:<skill>` covers it), **missing** (no owner in the plugin; the issue column names the fix), **thin overlay** (a plugin wrapper around a host built-in, never around another plugin, since ADR-0009 forbids that reference), **skip** (deliberately left out, reason given).

| Id | Phase | Practice | Sources | Verdict | Reason | Issue |
|---|---|---|---|---|---|---|
| A1 | Project bootstrap | Repository, tracker project and wiki page in one run | `/init` (Claude Code) | have `new-project-workflow` | The flow needs the tracker project and the wiki page, which `/init` does not create | |
| A2 | Project bootstrap | Platform config and status binding | Matt Pocock `setup-matt-pocock-skills` | have `determine-platform`, `bind-statuses` | Same idea as Matt Pocock's setup, recorded in the repo `CLAUDE.md` where every skill reads it | |
| A3 | Project bootstrap | Machine CLI state | none | have `bootstrap-clis` | | |
| A4 | Project bootstrap | Repository guardrails: pre-commit hooks, git safety hooks, module boundary checks | Matt Pocock `setup-pre-commit`, `git-guardrails-claude-code`, `setup-ts-deep-modules` | skip | Tooling choices of each repository; client repositories have their own, and the plugin does not install tooling into them | |
| A5 | Project bootstrap | Detecting a stale plugin install or stale skill copies | the four stale copies in `~/.agents/skills` | missing | See section 5: on 2026-10-10 Claude Code ran 0.45.0 against 0.51.0 on `main`, and Cursor loads June copies of four plugin skills next to the plugin, with no signal in either case | DEMO-413 |
| A6 | Issue and spec | Issue with a spec: objective, scope, criteria that name their check | Matt Pocock `to-spec`, `to-prd`, `request-refactor-plan` | have `issue-writer` | The spec lives on the tracker (ADR-0008); Matt Pocock's synthesis without interview is the minimal path of `issue-writer` | |
| A7 | Issue and spec | Splitting work into stages or sub-issues with blocking edges | Matt Pocock `to-tickets`, `to-issues` | missing | `issue-writer` only knows parent and children; stages in time need siblings with `blocked by`, and the adapters have no relation operation | DEMO-407 |
| A8 | Issue and spec | Triage of inbound bug reports, QA session filing issues | Matt Pocock `triage`, `qa`; pstack `triage-issue-reports`, `reproduce-and-fix-issues`, `setup-benny` | skip | No inbound report stream: issues are written by the developer with `issue-writer`; the automations write to the tracker without a human gate | |
| A9 | Issue and spec | Map of work larger than one session | Matt Pocock `wayfinder`; pstack `figure-it-out` | skip | An epic with sibling issues (A7) is the map; each issue is one session's worth | |
| A10 | Grilling | Interview in rounds until shared understanding | Matt Pocock `grilling`, `grill-me`, `grill-with-docs`, `batch-grill-me`; superpowers `brainstorming` | have `grill` | Rounds over the frontier, size said out loud, state as tracker comments | |
| A11 | Grilling | Questionnaire for a decision someone else answers | Matt Pocock `to-questionnaire` | skip | Rare; a tracker comment addressed to that person does the same | |
| A12 | Domain modelling | Glossary and ADR discipline | Matt Pocock `domain-modeling`, `ubiquitous-language` | skip | Grilling verdict of 2026-10-11 (DEMO-405): a step, not a skill. The "glossary term" tag of `grill` becomes an acceptance criterion in `issue-workflow` and `issue-writer`, checked by `validate-context-terms`, which fails on a `CONTEXT.md ## Language` term nothing else in the repository uses. The ADR discipline is already a repository convention (`docs/adr/`), and the entity page keeps the decisions | DEMO-405 |
| A13 | Domain modelling | Module and interface design, prototypes before code | Matt Pocock `codebase-design`, `design-an-interface`, `improve-codebase-architecture`, `prototype`; pstack `architect`, `principle-exhaust-the-design-space`, `principle-model-the-domain` | skip | The plan's Technical Approach is where the design is decided and reviewed; deep-module vocabulary is a repository standard, not a lifecycle step | |
| A14 | Plan | Implementation plan on the tracker, built from parallel context gathering | superpowers `writing-plans`; pstack `principle-sequence-verifiable-units`; Plan Mode in both hosts | have `issue-workflow`, `plan-context-fanout` | The host plan modes keep the plan in the chat; ours lives on the issue so another machine can resume it | |
| A15 | Plan execution | Sequential execution under phase gates | superpowers `executing-plans`; Matt Pocock `implement` | have `issue-workflow`, `issue-start` | | |
| A16 | Plan execution | Parallel subagent dispatch | superpowers `dispatching-parallel-agents`, `subagent-driven-development`; pstack `swarm`, `arena`, `principle-guard-the-context-window`, `principle-separate-before-serializing-shared-state`; Cursor `/best-of-n` | skip | Grilling verdict of 2026-10-11 (DEMO-405): no problem of ours behind it. In about 259 Claude Code sessions on this machine all 42 `Agent` calls were `auto-issue-mode` stages and none was an ad hoc parallel dispatch. Fan-out lives in the islands (code) and in the stages of `auto-issue-mode`, both with fixed prompts and shapes | DEMO-405 |
| A17 | Plan execution | Worktree isolation | superpowers `using-git-worktrees`; Claude Code worktrees; Cursor `/worktree` | skip | Both hosts ship worktrees as built-ins; one issue runs on one branch in one checkout, and nothing in the flow needs plugin context around a worktree | |
| A18 | Plan execution | Autonomous run of a whole issue | none | have `auto-issue-mode` | | |
| A19 | Plan execution | Resume and hand-off across sessions and machines | Matt Pocock `handoff`, `claude-handoff`; pstack `recall` | have `project-continue` plus the session summary | The tracker comment and the `## Checkpoints` entry are the hand-off document | |
| A20 | TDD | Test-first loop with a recorded exit | superpowers `test-driven-development`; Matt Pocock `tdd`; pstack `tdd`, `principle-test-behavior-not-implementation` | have `tdd` | | |
| A21 | Debugging | Feedback loop, ranked hypotheses, root cause before the fix | superpowers `systematic-debugging`; Matt Pocock `diagnosing-bugs` (and `diagnose` in `~/.agents/skills`); pstack `principle-fix-root-causes`, `principle-attack-the-premise`, the `poteto-mode` bug-fix playbook; Cursor Debug Mode | missing, in progress (DEMO-405) | Grilling verdict of 2026-10-11: built, narrowly. A test or validator red for an unknown reason has no owner between `tdd`'s "Verify red" and `auto-issue-mode`'s stop, and Claude Code has no Debug Mode. `debug` enters through the feedback loop, ranks up to three hypotheses, proves a forced mutation landed before trusting a red test, redacts secrets before showing a command, writes the regression test through `tdd` and stops after three failed fixes; no defense in depth, no architecture phase, no pressure-test framing | DEMO-405 |
| A22 | Verification | Evidence before claiming done | superpowers `verification-before-completion`; pstack `principle-prove-it-works` | have `tdd` (check beat) and the criteria verification table of `issue-workflow` | | |
| A23 | Verification | Driving the running application as a user would | pstack `create-verification-skill`, `maintain-verification-skill` | skip | The plugin has no running application; a project that has one writes its own verification skill | |
| A24 | Review (request) | Independent review axes, adversarial verification | superpowers `requesting-code-review`; Matt Pocock `code-review`; pstack `interrogate`, `no-comments`; `/code-review`, `/security-review`, `/simplify`; Cursor `/review`, Bugbot | have `review-verify` | The built-ins stay available by hand; the flow uses the island because its findings are verified and counted | |
| A25 | Review (receive) | Acting on review comments that people or bots leave on the PR or MR | superpowers `receiving-code-review`; Cursor Bugbot comments | missing | The island's findings are verified before they are fixed, but comments left on the PR or MR by colleagues (the only reviewers on client repositories) or by Bugbot are never read: the VCS adapters have no operation for them | DEMO-414 |
| A26 | Finishing a branch | Merge through the PR with a merge commit, switch to base | superpowers `finishing-a-development-branch` | have `issue-close` | | |
| A27 | Finishing a branch | PR or MR body written for human reviewers | pstack `blast-radius` | missing | The draft body is `Fixes <ID>` plus one paragraph; on client repositories it is the only text other developers read | DEMO-410 |
| A28 | Finishing a branch | Resolving merge conflicts | Matt Pocock `resolving-merge-conflicts` | skip | `issue-close` stops and reports; each conflict is resolved with the user, case by case | |
| A29 | Close-out | Issue to done, base branch checked out | none | have `issue-close` | The check for unfinished children is DEMO-406, a refinement of this row | |
| A30 | Wiki and memory | Project entity page, decisions, checkpoints | Matt Pocock `obsidian-vault`; `obsidian-markdown` in `~/.agents/skills` | have `nerdbrain-wiki`, `nerdbrain-search` | `nerdbrain-wiki` names `obsidian-markdown` for note syntax, a skill Claude Code does not load; harmless, since the syntax it needs is plain Markdown with wiki links | |
| A31 | Wiki and memory | Session retrospective: lessons become issues | pstack `reflect`, `correct`, `principle-encode-lessons-in-structure` | missing | Lessons today end in memory files or nowhere; the plugin's rule is that a lesson becomes a tracker issue | DEMO-411 |
| A32 | Wiki and memory | Decision trail file | pstack `show-me-your-work` | skip | The issue thread (grill state, plan, spec changes, session summaries) is the trail | |
| A33 | Skills | Writing a skill | superpowers `writing-skills`; superpowers-developing-for-claude-code `developing-claude-code-plugins`, `working-with-claude-code`; Matt Pocock `writing-great-skills`; `write-a-skill`, `find-skills` in `~/.agents/skills`; `skill-creator`; Cursor `/create-skill` | skip | Only this repository writes skills; its rules are in `CONTRIBUTING.md` and enforced by the validators | |
| A34 | Skills | Testing a skill: an eval runner and coverage of the core skills | `claude plugin eval` | missing | `validate-evals.ts` checks the shape of two eval files; nothing runs them, and `issue-workflow`, `issue-start` and `issue-close` have none | DEMO-412 |
| A35 | Cross-cutting | Human documentation | Matt Pocock `edit-article`, `writing-beats`, `writing-fragments`, `writing-shape`; pstack `technical-writing`, `unslop` | have `nerd-documentation-write` | | |

## 4. The nine practices of 2026-10-06, re-rated

| Practice | Decision on 2026-10-06 | Now | What the full list changed |
|---|---|---|---|
| TDD | Own skill `tdd` | have (A20) | Nothing. pstack's `tdd` agrees with the recorded-reason exit (test first only when the test path is cheap) |
| Debugging | Own skill `debug` | being built in DEMO-405 (A21) | The grilling session of 2026-10-11 named the problem: a red test or validator with an unknown cause has no owner between `tdd`'s "Verify red" and `auto-issue-mode`'s stop. Cursor's Debug Mode does the hypotheses-plus-instrumentation loop natively on one host only, which confirms the ranked-hypotheses choice; the skill stays narrow (feedback loop in, up to three hypotheses, regression test through `tdd`, stop after three fixes) and drops defense in depth, the architecture phase and the pressure-test framing |
| Subagent dispatch | Own skill `dispatch-agents` | skip (A16, DEMO-405) | The grilling session of 2026-10-11 found no problem of ours: all 42 `Agent` calls in about 259 sessions were `auto-issue-mode` stages. Fan-out stays in the islands and in those stages |
| Grilling | Own skill `grill` | have (A10) | Shipped in 0.49.0 |
| Domain modelling | Own skill `model-domain` | skip as a skill; a step plus a validator (A12, DEMO-405) | The grilling session of 2026-10-11 found the real gap in the executor of the "glossary term" tag, not in the modelling method: `CONTEXT.md ## Language` is maintained by hand and three of its terms are used nowhere else. `issue-workflow` and `issue-writer` turn the tag into an acceptance criterion checked by `validate-context-terms`. pstack's `principle-model-the-domain` is about code structure, not the glossary; it goes to A13 |
| Review | Own, inside `review-verify` | have (A24) plus missing (A25) | The 2026-10-06 decision read `receiving-code-review` only for the island's own findings. Comments from people and bots on the PR are a separate practice with no owner |
| Planning | Own, in `issue-workflow` | have (A14) | Both hosts have a plan mode; ours stays because the plan has to live on the tracker |
| Verification before completion | Folded into `tdd` and the verification table | have (A22) | Nothing |
| Finishing a branch | Own, `issue-close` | have (A26) plus missing (A27) | The PR body for human reviewers had no row then; pstack's `blast-radius` and the client-repository audience make it one |

## 5. Version drift

What happened: on 2026-10-10 the Claude Code install of the plugin was 0.45.0 while `main` was 0.51.0, six releases behind, and it was updated by hand that day. Sessions in between ran old skill text, and superpowers filled the gaps those versions had, with no signal to the user. The same kind of drift exists on the Cursor side: Cursor loads `~/.agents/skills`, where four plugin skills still sit under their June names (`linear-issue-workflow`, `linear-issue-writer`, `nerdbrain-wiki`, `new-project-workflow`), and the state of the Cursor install itself is tracked in DEMO-409.

Verdict: missing (A5). Detection belongs to the plugin, not to a person remembering to check, because the plugin is the only party that knows its own version. The mechanism (a session-start check, a `project-continue` step, a `bootstrap-clis` probe) is decided in the gap issue, not here.

## 6. Coverage by skill (table B)

Every skill from the command in section 2, mapped to a row of table A, or marked off-cycle with a reason. A skill can feed a row without being needed by it: the verdict is in table A.

| Library | Skill | Row | Note |
|---|---|---|---|
| ~/.agents/skills | `ask-matt` | off-cycle | router over its own library |
| ~/.agents/skills | `caveman` | off-cycle | response style |
| ~/.agents/skills | `code-review` | A24 |  |
| ~/.agents/skills | `codebase-design` | A13 |  |
| ~/.agents/skills | `defuddle` | off-cycle | web extraction tooling |
| ~/.agents/skills | `diagnose` | A21 | older name of diagnosing-bugs |
| ~/.agents/skills | `diagnosing-bugs` | A21 |  |
| ~/.agents/skills | `domain-modeling` | A12 |  |
| ~/.agents/skills | `find-skills` | A33 |  |
| ~/.agents/skills | `grill-me` | A10 |  |
| ~/.agents/skills | `grill-with-docs` | A10 |  |
| ~/.agents/skills | `grilling` | A10 |  |
| ~/.agents/skills | `handoff` | A19 |  |
| ~/.agents/skills | `implement` | A15 |  |
| ~/.agents/skills | `improve-codebase-architecture` | A13 |  |
| ~/.agents/skills | `json-canvas` | off-cycle | Obsidian canvas files; the wiki uses notes only |
| ~/.agents/skills | `linear-issue-workflow` | A5 | stale copy of issue-workflow under its June name |
| ~/.agents/skills | `linear-issue-writer` | A5 | stale copy of issue-writer under its June name |
| ~/.agents/skills | `nerdbrain-wiki` | A5 | stale copy of the plugin's own skill |
| ~/.agents/skills | `new-project-workflow` | A5 | stale copy of the plugin's own skill |
| ~/.agents/skills | `obsidian-bases` | off-cycle | Obsidian bases; the wiki uses notes only |
| ~/.agents/skills | `obsidian-cli` | off-cycle | vault access is filesystem only |
| ~/.agents/skills | `obsidian-markdown` | A30 | named by nerdbrain-wiki for note syntax |
| ~/.agents/skills | `prototype` | A13 |  |
| ~/.agents/skills | `research` | off-cycle | research documents are written by hand when needed |
| ~/.agents/skills | `setup-matt-pocock-skills` | A2 | configures its own library the way determine-platform configures ours |
| ~/.agents/skills | `supabase` | off-cycle | product-specific |
| ~/.agents/skills | `supabase-postgres-best-practices` | off-cycle | product-specific |
| ~/.agents/skills | `tdd` | A20 |  |
| ~/.agents/skills | `teach` | off-cycle | explanation on request; codebase questions go through plain reads |
| ~/.agents/skills | `to-issues` | A7 |  |
| ~/.agents/skills | `to-prd` | A6 |  |
| ~/.agents/skills | `to-spec` | A6 |  |
| ~/.agents/skills | `to-tickets` | A7 |  |
| ~/.agents/skills | `triage` | A8 |  |
| ~/.agents/skills | `wayfinder` | A9 |  |
| ~/.agents/skills | `write-a-skill` | A33 |  |
| ~/.agents/skills | `writing-great-skills` | A33 |  |
| ~/.agents/skills | `zoom-out` | off-cycle | codebase questions go through plain reads |
| pstack | `architect` | A13 |  |
| pstack | `arena` | A16 |  |
| pstack | `automate-me` | off-cycle | preferences live in the user CLAUDE.md and nerdbrain |
| pstack | `benchmark-checklist` | off-cycle | performance work |
| pstack | `blast-radius` | A27 |  |
| pstack | `bro` | off-cycle | response style |
| pstack | `correct` | A31 |  |
| pstack | `create-verification-skill` | A23 |  |
| pstack | `figure-it-out` | A9 |  |
| pstack | `how` | off-cycle | codebase questions go through plain reads |
| pstack | `interrogate` | A24 |  |
| pstack | `maintain-verification-skill` | A23 |  |
| pstack | `make-bot-ui` | off-cycle | product-specific |
| pstack | `no-comments` | A24 | the rule is standard 1, checked by the repo-standards axis |
| pstack | `poteto-help` | off-cycle | router over its own library |
| pstack | `poteto-mode` | off-cycle | router and style mode; its bug-fix playbook feeds A21, its shipping playbooks rely on stacked PRs the plugin rejected |
| pstack | `principle-attack-the-premise` | A21 |  |
| pstack | `principle-boundary-discipline` | off-cycle | coding principle; belongs in a repository's standards |
| pstack | `principle-build-the-lever` | off-cycle | working habit, not a lifecycle step |
| pstack | `principle-encode-lessons-in-structure` | A31 |  |
| pstack | `principle-exhaust-the-design-space` | A13 |  |
| pstack | `principle-experience-first` | off-cycle | product principle |
| pstack | `principle-explain-the-number` | off-cycle | performance work |
| pstack | `principle-fix-root-causes` | A21 |  |
| pstack | `principle-foundational-thinking` | off-cycle | coding principle; belongs in a repository's standards |
| pstack | `principle-guard-the-context-window` | A16 |  |
| pstack | `principle-laziness-protocol` | off-cycle | coding principle; the user CLAUDE.md simplicity rule covers it |
| pstack | `principle-make-operations-idempotent` | off-cycle | coding principle; belongs in a repository's standards |
| pstack | `principle-migrate-callers-then-delete-legacy-apis` | off-cycle | coding principle; belongs in a repository's standards |
| pstack | `principle-minimize-reader-load` | off-cycle | coding principle; review judgement call |
| pstack | `principle-model-the-domain` | A13 | code structure, not the glossary of A12 |
| pstack | `principle-never-block-on-the-human` | off-cycle | contradicts the human gates on phase moves and tracker writes |
| pstack | `principle-outcome-oriented-execution` | off-cycle | migration principle |
| pstack | `principle-prove-it-works` | A22 |  |
| pstack | `principle-redesign-from-first-principles` | off-cycle | design principle; review judgement call |
| pstack | `principle-separate-before-serializing-shared-state` | A16 |  |
| pstack | `principle-sequence-verifiable-units` | A14 |  |
| pstack | `principle-subtract-before-you-add` | off-cycle | coding principle; the user CLAUDE.md surgical-change rule covers it |
| pstack | `principle-test-behavior-not-implementation` | A20 |  |
| pstack | `principle-type-system-discipline` | off-cycle | coding principle; belongs in a repository's standards |
| pstack | `recall` | A19 |  |
| pstack | `reflect` | A31 |  |
| pstack | `reproduce-and-fix-issues` | A8 |  |
| pstack | `setup-benny` | A8 |  |
| pstack | `setup-pstack` | off-cycle | per-role model configuration, rejected on 2026-10-06 |
| pstack | `show-me-your-work` | A32 |  |
| pstack | `swarm` | A16 |  |
| pstack | `tdd` | A20 |  |
| pstack | `teach` | off-cycle | explanation on request; codebase questions go through plain reads |
| pstack | `technical-writing` | A35 |  |
| pstack | `triage-issue-reports` | A8 |  |
| pstack | `typescript-best-practices` | off-cycle | language standard; belongs in a repository's standards |
| pstack | `unslop` | A35 |  |
| pstack | `why` | off-cycle | codebase questions go through plain reads |
| mattpocock-skills | `ask-matt` | off-cycle | router over its own library |
| mattpocock-skills | `batch-grill-me` | A10 |  |
| mattpocock-skills | `claude-handoff` | A19 |  |
| mattpocock-skills | `code-review` | A24 |  |
| mattpocock-skills | `codebase-design` | A13 |  |
| mattpocock-skills | `design-an-interface` | A13 |  |
| mattpocock-skills | `diagnosing-bugs` | A21 |  |
| mattpocock-skills | `domain-modeling` | A12 |  |
| mattpocock-skills | `edit-article` | A35 |  |
| mattpocock-skills | `git-guardrails-claude-code` | A4 |  |
| mattpocock-skills | `grill-me` | A10 |  |
| mattpocock-skills | `grill-with-docs` | A10 |  |
| mattpocock-skills | `grilling` | A10 |  |
| mattpocock-skills | `handoff` | A19 |  |
| mattpocock-skills | `implement` | A15 |  |
| mattpocock-skills | `improve-codebase-architecture` | A13 |  |
| mattpocock-skills | `loop-me` | off-cycle | interview about the author's own workflows |
| mattpocock-skills | `migrate-to-shoehorn` | off-cycle | library-specific test migration |
| mattpocock-skills | `obsidian-vault` | A30 |  |
| mattpocock-skills | `prototype` | A13 |  |
| mattpocock-skills | `qa` | A8 |  |
| mattpocock-skills | `request-refactor-plan` | A6 |  |
| mattpocock-skills | `research` | off-cycle | research documents are written by hand when needed |
| mattpocock-skills | `resolving-merge-conflicts` | A28 |  |
| mattpocock-skills | `scaffold-exercises` | off-cycle | course authoring |
| mattpocock-skills | `setup-matt-pocock-skills` | A2 | configures its own library the way determine-platform configures ours |
| mattpocock-skills | `setup-pre-commit` | A4 |  |
| mattpocock-skills | `setup-ts-deep-modules` | A4 |  |
| mattpocock-skills | `tdd` | A20 |  |
| mattpocock-skills | `teach` | off-cycle | explanation on request; codebase questions go through plain reads |
| mattpocock-skills | `to-questionnaire` | A11 |  |
| mattpocock-skills | `to-spec` | A6 |  |
| mattpocock-skills | `to-tickets` | A7 |  |
| mattpocock-skills | `triage` | A8 |  |
| mattpocock-skills | `ubiquitous-language` | A12 |  |
| mattpocock-skills | `wayfinder` | A9 |  |
| mattpocock-skills | `wizard` | off-cycle | generator of manual-procedure scripts |
| mattpocock-skills | `writing-beats` | A35 |  |
| mattpocock-skills | `writing-fragments` | A35 |  |
| mattpocock-skills | `writing-great-skills` | A33 |  |
| mattpocock-skills | `writing-shape` | A35 |  |
| superpowers | `brainstorming` | A10 | size check and approaches for one-way decisions already taken into grill |
| superpowers | `dispatching-parallel-agents` | A16 |  |
| superpowers | `executing-plans` | A15 | built around a plan file the tracker replaced |
| superpowers | `finishing-a-development-branch` | A26 |  |
| superpowers | `receiving-code-review` | A25 |  |
| superpowers | `requesting-code-review` | A24 |  |
| superpowers | `subagent-driven-development` | A16 | plan-file loop not taken; independence test is |
| superpowers | `systematic-debugging` | A21 |  |
| superpowers | `test-driven-development` | A20 |  |
| superpowers | `using-git-worktrees` | A17 |  |
| superpowers | `using-superpowers` | off-cycle | session bootstrap that steers every task towards superpowers; the plugin's own gates replace it |
| superpowers | `verification-before-completion` | A22 |  |
| superpowers | `writing-plans` | A14 |  |
| superpowers | `writing-skills` | A33 |  |
| superpowers-chrome | `browsing` | off-cycle | browser automation; both hosts ship their own browser tools |
| superpowers-developing-for-claude-code | `developing-claude-code-plugins` | A33 |  |
| superpowers-developing-for-claude-code | `professional-greeting` | off-cycle | demo skill (greeting tone) |
| superpowers-developing-for-claude-code | `workflow` | off-cycle | demo of plugin features |
| superpowers-developing-for-claude-code | `working-with-claude-code` | A33 | host documentation, not a practice |
| superpowers-lab | `finding-duplicate-functions` | off-cycle | codebase audit; duplication is a review judgement call |
| superpowers-lab | `mcp-cli` | off-cycle | tooling for MCP access |
| superpowers-lab | `using-tmux-for-interactive-commands` | off-cycle | terminal tooling |
| superpowers-lab | `windows-vm` | off-cycle | environment tooling |
