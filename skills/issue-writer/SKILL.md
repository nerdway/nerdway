---
name: issue-writer
description: >-
  Create a NEW tracker issue (Linear, GitHub Issues or GitLab Issues) for the current
  repo/project with clearly specified goals, so the planning agent can build an implementation plan from it. Use when
  the user wants to file/create/open a new issue or task ("utwórz/stwórz/dodaj/zgłoś
  issue/zadanie", "create issue", "new task") and does NOT yet have an issue ID.
  Adaptively interviews for missing goals, drafts the issue, gates the tracker
  write on approval, creates the issue in the backlog phase, and offers an optional inline
  grilling session that can split the topic into sub-issues. Distinct
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
metadata flags), `## URL` how to build an issue link, and `## Statuses` the
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
GitLab Issues) and asks to plan or implement it → that is `nerd4rent:issue-workflow`, not this skill. This skill
*ends* by pointing at that one's status-driven flow.

## Hard gate (do not skip)

**No write to the tracker** (`issue.create`, sub-issues, labels) until the user has seen
the drafted issue body and approved it. Allowed before approval: tracker read
operations, reading the repo/entity-page for context, asking clarifying questions,
drafting the issue text. The same gate applies to sub-issues proposed by a
grilling session (step 6).

## Grilling protocol (inline)

A grilling session interrogates the topic until shared understanding. Rules:

1. Interrogate every aspect of the topic until shared understanding is reached.
2. Walk down the decision tree, resolving dependencies between decisions one
   branch at a time.
3. Ask **one question at a time** and wait for the answer.
4. Give a **recommended answer** with every question.
5. Verify facts yourself in the environment (code, repo, CLI) — ask the user
   only about **decisions**.
6. Do not act on the outcome until the user confirms shared understanding.

If `mattpocock-skills:grilling` is available in the session, you may use it for
question formats — the inline rules above always work without it (same graceful
degradation as external skill families elsewhere). Never delegate to the
`grill-me` / `grill-with-docs` wrappers: they carry
`disable-model-invocation: true` and only the user can run them, manually, as
slash commands.

## Workflow

### 1. Resolve the platform, then the target team & project

**Platform first.** Take the tracker and its identifiers from the first source
that has them:

1. the `## Platform` section of the repo `CLAUDE.md`;
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

### 2. Assess complexity (adaptive threshold)

Pick the path the same way every later adaptive choice is made:

| Signal | Path |
|--------|------|
| Single, clear, small task; user already stated the outcome | **Draft straight away**, minimal template (Objective + Acceptance criteria) |
| Vague, broad, or multi-part; outcome/criteria unclear | **Short interview first**, full template |

Run the interview per the **grilling protocol** above (no docs part at this
stage): one question at a time, a recommended answer with each, facts verified
yourself, only decisions asked. Cover only what is missing: objective,
problem/context, acceptance criteria, scope (in/out), constraints,
dependencies, open questions. Stop as soon as the goals are unambiguous — do
not interrogate a task that is already clear.

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
dla tego issue?* If yes, run it **inline** per the grilling protocol above
(no docs part in this skill), taking the created issue's body as the input.
Handle the outcome:

- sharpened requirements → update the issue description
  (`issue.update-description`) after showing the diff;
- the topic splits into stages → propose sub-issues (step 3 rules apply) and
  create them with `issue.create-child` under `<ID>` **only after the user
  approves the drafts** (hard gate above).

Skip the offer for a small, clear task — same adaptive threshold as step 2.

### 7. Output + handoff

Print the created issue ID(s) — as step 5 captured them — and, when a
link helps, build the URL per the adapter's `## URL` section. Then point at
the status-driven flow — do **not** offer to plan it yourself in this session:

> *Issue utworzone (DEMO-123) — w Backlogu. Wpisz ID issue w nowej sesji lub
> wiadomości, aby rozpocząć planowanie.*

Planning, implementation, and review are driven by the issue's phase on the tracker in
`nerd4rent:issue-workflow` — keep creation and planning as separate,
deliberate steps.

## Related skills

- `nerd4rent:issue-workflow` — downstream: status-driven planning and
  implementation of an issue ID produced here.
- `nerd4rent:determine-platform` — upstream: records the platform this skill
  files issues on; invoked from step 1 when none is configured.
- `mattpocock-skills:grilling` (optional, `npx skills` / `~/.agents/skills`) —
  question formats for the inline grilling protocol; degrade gracefully when
  absent.
- `nerd4rent:new-project-workflow` — bootstraps a whole project; routes to
  spec-creating skills. This skill is the issue-level counterpart.
