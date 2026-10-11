---
name: issue-writer
description: >-
  Create a NEW tracker issue (Linear, GitHub Issues, GitLab Issues or Azure DevOps Boards) for the current
  repo/project with clearly specified goals, so the planning agent can build an implementation plan from it. Use when
  the user wants to file/create/open a new issue or task ("utwórz/stwórz/dodaj/zgłoś
  issue/zadanie", "create issue", "new task") and does NOT yet have an issue ID.
  Adaptively interviews for missing goals, drafts the issue, gates the tracker
  write on approval, creates the issue in the backlog phase, and offers an optional
  grilling session, run through nerd4rent:grill, that can split the topic into
  sub-issues. Distinct
  from issue-workflow (which plans/implements an EXISTING issue ID).
  Delegates to determine-platform when no platform is configured; tracker
  commands come from the platform adapter.
---

# Issue writer

Create well-formed tracker issues whose goals are specified clearly enough that
`nerd4rent:issue-workflow` can plan implementation directly from them.

## Platform and adapters

Tracker commands live in an adapter file at the plugin root, never in this
skill. Run every operation by its ID from the adapter's `## Operations`
table; its `## CLI` section carries the command gotchas (multi-line bodies,
metadata flags), `## URL` the recipe behind `issue.url`, and `## Statuses` the
state names:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

## When this skill applies

The user wants to **create a new issue/task** and has **no existing issue ID**.
Triggers include Polish *utwórz / stwórz / dodaj / zgłoś / załóż issue / zadanie /
task* and English *create / open / file / new issue / task*.

**Disambiguation:** if the user gives an existing issue ID (`TEAM-123`, or
`#123` / `owner/repo#123` on GitHub Issues, `#123` / `group/project#123` on
GitLab Issues, `#123` / `AB#123` on Azure DevOps Boards) and asks to plan or implement it → that is `nerd4rent:issue-workflow`, not this skill. This skill
*ends* by pointing at that one's status-driven flow.

## Hard gate (do not skip)

**No write to the tracker** (`issue.create`, sub-issues, labels) until the user has seen
the drafted issue body and approved it. Allowed before approval: tracker read
operations, reading the repo/entity-page for context, asking clarifying questions,
drafting the issue text. The same gate applies to sub-issues proposed by a
grilling session (step 6).

## Workflow

### 1. Resolve the platform, then the target team & project

**Platform first.** Take the tracker and its identifiers from the first source
that has them:

1. the `## Platform` section of the repo `CLAUDE.md`, read from disk as
   `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes, never from context;
2. the entity page frontmatter `platform:` — a legacy `linear:` block there
   means `tracker: linear` with that `team` and `project`;
3. neither → **invoke `nerd4rent:determine-platform`** and take the platform
   from its output.

No adapter file for the tracker → stop and report: "adapter
`trackers/<tracker>` is not available yet in this plugin version" — never
fall back to another tracker.

**Then the target.** Use the config's identifiers (for Linear: `team` key and
`project`). When the config names none, list options (`team.list`,
`project.list` filtered by team) and ask; sanity-check a typed team key with
`team.check`. Show the resolved `team` + `project` and get a quick
confirmation **before writing**.

When the adapter lists `team.*` and `project.*` as `—` (GitHub Issues,
GitLab Issues), the repo is the container: take it from the config's `github`
block (`owner/repo`) or `gitlab` block (`group/project`), skip the team and
project questions, and confirm the repo instead.

On Azure DevOps Boards (`tracker: ado`) the project is the container and the
issue is a work item of type `ado.workItemType`, created on `ado.team`'s board:
take all of them from the `ado` block and confirm project + type. When the
block has no `workItemType`, stop and run `nerd4rent:bind-statuses` first — it
picks the team, board and type — never guess a type. Sub-issues are the same
type with a parent link, so they land on the same board.

### 2. Assess complexity (out loud)

Invoke **`nerd4rent:grill`** with the two argument lines `issue: none` and
`topic: the user's request`. It says the size of the topic out loud before any
question, so the user can override it, and the size picks the path:

| Size the skill announces | Path |
|--------|------|
| **small** — one clear deliverable, outcome already stated | the skill returns at once: **draft straight away**, minimal template (Objective + Acceptance criteria) |
| **medium** — one piece of work with open decisions | the skill interviews in rounds; draft with the full template from its confirmed outcome |
| **large** — plainly splits into stages | the outcome proposes the split; step 3 turns it into sub-issues |

The decisions the interview settles are the template's sections the request
leaves open: objective, problem/context, acceptance criteria, scope (in/out),
constraints, dependencies, open questions. Facts about the repo are checked by
the skill, not asked. A decision the outcome tags **glossary term** becomes an
acceptance criterion of the drafted issue: "`CONTEXT.md ## Language` has the
term `<Term>` — check: `node scripts/validate-context-terms.ts`"; the entry
itself is written when the issue is implemented.

### 3. Decide decomposition

Default is a **checklist in the issue body** when the work has clear discrete steps.
Escalate to **real sub-issues** only when the topic plainly splits into stages.

| Situation | Action |
|-----------|--------|
| Clear discrete steps within one deliverable | Implementation checklist in the description (default) |
| Topic plainly splits into stages/epics | **Propose** a parent + N child issues, each child with its own mini-template; create only after approval |
| User explicitly asks for sub-issues | Create sub-issues even if you would have used a checklist |
| User rejects sub-issues as too granular | Collapse the proposed children back into one issue + checklist |

When proposing sub-issues, present the split as a short list (each child's title +
one-line objective) and let the user accept, edit, or decline before any write.

### 4. Draft the issue body

Use the bundled `issue-template.md` (full variant for complex issues, minimal
variant for small ones). The sections mirror `issue-workflow/plan-template.md`
so the planner knows exactly where to look. Match the issue language to the user /
repo (PL or EN).

`issue-template.md` is **generated** from the `IssueSpec` schema in
`workflow-graph.json` (`node scripts/render-templates.ts`); fix a section by
editing the schema, not the file. Filling it stays prose — nothing here asks you
or the user for JSON.

Write the body to a temp file and **show it to the user**. Wait for approval.

### 5. Create on the tracker (always in the backlog phase)

New issues start in the **`backlog`** phase — run `issue.create` with the
title, the resolved container and the approved body file; the adapter's notes
say how the backlog phase is written (on Linear the state is passed
explicitly so the team's default cannot override it).

For a parent + sub-issues, create the parent first with `issue.create`,
capture its ID (`TEAM-123`, `#123`) as the operation's notes describe, then create each child with
`issue.create-child`, passing that ID as the parent.

Add labels, priority or estimate only when the user specified them — don't
invent metadata; the adapter's `## CLI` section lists the flags and their
quirks.

### 6. Grilling session (optional)

For a complex or still-fuzzy topic, ask the user: *Odpalić sesję grillowania
dla tego issue?* If yes, invoke **`nerd4rent:grill`** with `issue: <ID>` (the
issue step 5 created) and `topic: the created issue's body`; the skill records
its state as comments on that issue, so the session can resume on another
machine. Handle the confirmed outcome:

- sharpened requirements → update the issue description
  (`issue.update-description`) after showing the diff;
- a decision tagged **glossary term** → the same acceptance criterion as in
  step 2 ("`CONTEXT.md ## Language` has the term `<Term>` — check:
  `node scripts/validate-context-terms.ts`"), added to the description in
  that update;
- the topic splits into stages → propose sub-issues (step 3 rules apply) and
  create them with `issue.create-child` under `<ID>` **only after the user
  approves the drafts** (hard gate above).

Skip the offer when step 2 classified the topic as small.

### 7. Output + handoff

Print the created issue ID(s) — as step 5 captured them — each with its link
from `issue.url`, in the shape *Asking the human to move a phase* in
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` gives. Then point at the
status-driven flow — do **not** offer to plan it yourself in this session:

> *Issue utworzone (DEMO-123) — w Backlogu: <link>. Wpisz ID issue w nowej
> sesji lub wiadomości, aby rozpocząć planowanie.*

Planning, implementation, and review are driven by the issue's phase on the tracker in
`nerd4rent:issue-workflow` — keep creation and planning as separate,
deliberate steps.

## Related skills

- `nerd4rent:grill` — the interview of step 2 (`issue: none`) and the
  optional session of step 6 (`issue: <ID>`); it announces the size and
  returns a confirmed outcome.
- `nerd4rent:issue-workflow` — downstream: status-driven planning and
  implementation of an issue ID produced here.
- `nerd4rent:determine-platform` — upstream: records the platform this skill
  files issues on; invoked from step 1 when none is configured.
- `nerd4rent:auto-issue-mode` — runs this skill's creation flow without
  grilling, then carries the issue autonomously to merge and done.
- `nerd4rent:new-project-workflow` — bootstraps a whole project; routes to
  spec-creating skills. This skill is the issue-level counterpart.
