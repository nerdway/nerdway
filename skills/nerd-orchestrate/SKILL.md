---
name: nerd-orchestrate
argument-hint: "[project path or tracker project id]"
description: >-
  Orchestrate a project's unplanned issues: report progress with
  project-continue, plan every open issue that has no comment whose first
  line is exactly `## Implementation plan`, then ask before auto-issue-mode,
  at most two git worktrees in parallel on Claude Code and Cursor. Use when
  the user wants to orkiestruj / orchestrate a project, zaplanuj projekt,
  run worktrees across the backlog, or continue from where-were-we into
  planning and AIM. Distinct from project-continue (report only) and from
  issue-next-step (one issue).
---

# Nerd orchestrate

You are the **orchestrator** of a project's unplanned work: progress, then
planning, then auto-issue-mode. You resolve the project, invoke
`nerdway:project-continue`, filter the unplanned issues, ask how to plan
them, post each plan through `issue-workflow`'s Planning phase only, ask
before every AIM run, and dispatch `nerdway:auto-issue-mode` in a
subagent. You rewrite none of those skills. The code, the commits and the
tracker writes of a stage belong to the skill you invoke; you edit no file
in the repo yourself.

## First step: the project, before the queue

The argument is optional. A filesystem path is a repo to work in (read its
nerdway platform config, run git there). A tracker project id (Linear UUID, GitHub
`owner/repo`, GitLab `group/project`, Azure DevOps project name) selects
that project on the already resolved tracker. With neither, the project is
the current working directory.

Resolve the platform exactly as `nerdway:issue-writer` step 1 does (nerdway
platform config, read from disk as
`${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes → entity page
`platform:` / legacy `linear:` → `nerdway:determine-platform`), and the
status strategy and map as
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` describes. No adapter file
→ stop and report: "adapter `trackers/<tracker>` is not available yet in
this plugin version".

Tracker commands live in the adapter, never in this skill. This skill
reads through `issue.list-open`, `issue.read` and `issue.url`, and writes
only by invoking the skills below:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

## Progress

Invoke `nerdway:project-continue` in this conversation and wait for its
report. That skill is read-only here: do not record a checkpoint unless
the user already said yes to its own question. After the report, keep the
open-issue list it printed.

Then list unplanned issues. An **unplanned issue** is an open issue in
canonical phase `backlog`, `todo` or `in-progress` that has no comment
whose **first line is exactly** `## Implementation plan`. `in-review` is
open and never unplanned. The filter is also
`scripts/lib/implementation-plan.ts`. For each open issue in those three
phases run `issue.read` and keep it only when
`hasImplementationPlanComment` is false. Print the unplanned list (id,
title, phase, `issue.url`) before asking anything.

A comment that merely contains the heading, a stub whose first line is
`## Implementation plan (draft)`, acceptance criteria in the description,
a handoff, or "do it now" / "zrób od razu" does **not** count. OPS-23:
no Start, no repo edit, no CloudAgent, no AIM, until that exact first
line exists on the issue.

Zero unplanned issues: say so after the progress report and stop. Do not
ask the planning-mode question.

## Planning-mode menu

Always ask, with two or more unplanned issues and with one. One question,
native host ask when available (`AskUserQuestion` on Claude Code,
`AskQuestion` on Cursor, `SendToUser` on Grok Bot), else a numbered list
where "tak", "yes" or "1" picks the recommendation. Two options, recommended
first; not a yes/no. The shapes live in `reference.md`.

1. **Batch** — plan every unplanned issue first, then AIM the ones the
   user approves (recommended when there is more than one).
2. **Just-in-time** — for each unplanned issue in tracker order: plan,
   ask AIM, run AIM if yes, then the next.

## Plan

For each selected id, run `issue-workflow`'s **Planning phase only**:
draft from `issue-workflow/plan-template.md`, post with `issue.comment`
so the body **starts with** `## Implementation plan`, write phase `todo`
with `issue.set-status`. Do not Start, do not edit the repo, do not
launch a CloudAgent, do not write `in-progress`. Stop **before**
`post-plan.after-plan` — that host operation asks to implement or to
move the phase, and this skill asks about AIM instead.

Invoke `nerdway:issue-workflow` through the `Skill` tool with the id
and a prompt that names this restriction, or `Read` its `SKILL.md` and
follow the Planning phase yourself. Either way the core stays there; this
skill does not duplicate the fan-out, the template or the gates.

After the plan comment is on the tracker, ask before AIM. In **batch**,
finish every plan (and every AIM question) before dispatching any AIM, so
the queue is complete. In **just-in-time**, the AIM run of this id
finishes before the next plan starts.

## Ask before AIM

After every posted plan, ask once for that id, native host ask or the
numbered list in `reference.md`:

1. **Run auto-issue-mode for `<ID>`** (recommended) — same consent as
   typing `/nerdway:auto-issue-mode <ID>`.
2. **Skip AIM for `<ID>`** — leave the issue `todo` with the plan on it;
   continue the queue.

No, a skip, or any answer that is not a clear pick of option 1, skips
that id and continues. Do not start AIM without this yes. Do not treat
the planning-mode answer as AIM consent.

## AIM dispatch

`auto-issue-mode` is user-invoked only (`disable-model-invocation`), so
the `Skill` tool cannot start it. After a yes, `Read`
`${CLAUDE_PLUGIN_ROOT}/skills/auto-issue-mode/SKILL.md` and run it from
**entry B** with the issue id, in a subagent (`Agent` / `Task`,
`general-purpose`), carrying the resolved platform block. The run asks
nothing more until merge and `done`. You edit no file yourself.

Detect the host first (`host.detect`, same probe as
`scripts/lib/host-detect.ts` / `issue-workflow`). Then take the dispatch
from `scripts/lib/orchestrate-dispatch.ts` (`aimDispatchForHost`). Recipes
for worktrees and the Grok Bot path live in `reference.md`.

- **claude-code / cursor**, `git worktree` available, two or more AIM
  yeses: at most **two** worktrees in flight. Each AIM gets its own
  checkout on the default branch; the next queued id starts when a slot
  frees. Never two AIM runs in one cwd.
- **claude-code / cursor**, worktree missing or only one yes: sequential
  in this checkout.
- **grok-bot**: sequential in this session, **or** one CloudAgent per
  approved id, waiting for that run before the next. Do **not** add local
  worktrees as the parallel path on this host, even when `git worktree`
  works.

A missing plan comment still hard-stops AIM (its own OPS-23 gate). You
already posted the plan; if `issue.read` does not show it, do not
dispatch.

On a stop from AIM, report what is done, what is pending, the error, and
how to resume: `/nerdway:auto-issue-mode <ID>`. Continue the queue
unless the error is a missing adapter or an unknown phase for the whole
project.

## Hard gates (do not skip)

1. **Unplanned means the first line.** Only a comment whose first line is
   exactly `## Implementation plan` takes an issue off the unplanned
   list. `in-review` is never on that list.
2. **Planning writes the plan and `todo`, nothing else.** No Start, no
   repo edit, no CloudAgent, no `in-progress` in this skill.
3. **AIM waits for a yes after that plan.** The planning-mode menu is not
   that yes. Invoking AIM is then that issue's consent, as
   `auto-issue-mode` already documents.
4. **Max two parallel AIM runs**, and only through worktrees on Claude
   Code and Cursor. Grok Bot is sequential or CloudAgent.
5. **No checkpoint from progress** unless `project-continue` already
   asked and the user said yes.

## Stop conditions

Stop the run, never force it, when:

- the tracker or git CLI returns an error, or an adapter is missing;
- the phase read back is unknown;
- `project-continue` or `issue-workflow` Planning stops;
- two worktrees are already in flight and creating a third would break
  the cap — wait, do not exceed it.

## Final report

Close with the project's **evidence**: the progress summary in brief, the
unplanned list as it stood, each id with plan comment link or skip, each
AIM yes/skip, each AIM outcome (issue link, PR/MR, merge, or the resume
line), and which host dispatch ran (worktrees × N, sequential, or
CloudAgent).

## Related skills

- `nerdway:project-continue` — the progress report this skill invokes
  first; it never enters a workflow by itself.
- `nerdway:issue-workflow` — Planning phase only, then this skill asks
  about AIM instead of `post-plan.after-plan`.
- `nerdway:auto-issue-mode` — the autonomous run of one issue, started
  from entry B after a yes.
- `nerdway:issue-next-step` — the same handoff for a single id the user
  already named.
- `nerdway:determine-platform` — when the repo has no platform config.
