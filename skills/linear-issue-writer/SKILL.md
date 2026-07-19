---
name: linear-issue-writer
description: >-
  Create a NEW Linear issue for the current repo/project with clearly specified
  goals, so the planning agent can build an implementation plan from it. Use when
  the user wants to file/create/open a new issue or task ("utwórz/stwórz/dodaj/zgłoś
  issue/zadanie", "create issue", "new task") and does NOT yet have an issue ID.
  Adaptively interviews for missing goals, drafts the issue, gates the Linear write
  on approval, creates the issue in Backlog, and offers an optional inline
  grilling session that can split the topic into sub-issues. Distinct
  from linear-issue-workflow (which plans/implements an EXISTING issue ID).
  Use linear-cli for CLI syntax.
---

# Linear issue writer

Create well-formed Linear issues whose goals are specified clearly enough that
`nerd4rent:linear-issue-workflow` can plan implementation directly from them.

Use with the `linear-cli` skill for every `linear` command (flags, subcommands).

## When this skill applies

The user wants to **create a new issue/task** and has **no existing issue ID**.
Triggers include Polish *utwórz / stwórz / dodaj / zgłoś / załóż issue / zadanie /
task* and English *create / open / file / new issue / task*.

**Disambiguation:** if the user gives an existing `TEAM-123` and asks to plan or
implement it → that is `nerd4rent:linear-issue-workflow`, not this skill. This skill
*ends* by pointing at that one's status-driven flow.

## Hard gate (do not skip)

**No write to Linear** (`issue create`, sub-issues, labels) until the user has seen
the drafted issue body and approved it. Allowed before approval: `linear` read
commands, reading the repo/entity-page for context, asking clarifying questions,
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

### 1. Resolve target team & project

Determine where the issue is filed, in this order, then **confirm with the user
before writing**:

1. **nerdbrain entity-page** — if the injected project page has `linear.team`
   and/or `linear.project`, use them.
2. **Git remote inference** — map the repo to a Linear team/project (e.g. via
   `linear issue query --team <key>` to sanity-check the key exists).
3. **Ask** — if still unknown, list options (`linear team list`,
   `linear project list`) and ask which team/project.

Show the resolved `team` + `project` and get a quick confirmation. This works in
repos without a wiki page (fall back to inference/ask).

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
variant for small ones). The sections mirror `linear-issue-workflow/plan-template.md`
so the planner knows exactly where to look. Match the issue language to the user /
repo (PL or EN).

Write the body to a temp file and **show it to the user**. Wait for approval.

### 5. Create in Linear (always in Backlog)

New issues start in **Backlog** — pass the state explicitly so the team's
default state cannot override it:

```bash
linear issue create --team <key> --project <name> \
  -t "<title>" --description-file <path> -s backlog --no-interactive
```

For a parent + sub-issues, create the parent first, capture its `TEAM-123` ID from
the output, then create each child with `--parent`:

```bash
linear issue create --team <key> --project <name> \
  -t "<parent title>" --description-file <parent.md> -s backlog --no-interactive
# → note the new ID, e.g. DEMO-123
linear issue create --team <key> --project <name> \
  -t "<child title>" --description-file <child-1.md> --parent DEMO-123 -s backlog --no-interactive
```

Add `-l/--label`, `-p/--priority`, `--estimate`, etc. only when the user specified
them — don't invent metadata. (`linear` CLI supports `--parent`; no need for
`issue relation` for parent/child.)

### 6. Grilling session (optional)

For a complex or still-fuzzy topic, ask the user: *Odpalić sesję grillowania
dla tego issue?* If yes, run it **inline** per the grilling protocol above
(no docs part in this skill), taking the created issue's body as the input.
Handle the outcome:

- sharpened requirements → update the issue description
  (`linear issue update <ID> --description-file <path>`) after showing the diff;
- the topic splits into stages → propose sub-issues (step 3 rules apply) and
  create them with `--parent <ID> -s backlog` **only after the user approves
  the drafts** (hard gate above).

Skip the offer for a small, clear task — same adaptive threshold as step 2.

### 7. Output + handoff

Print the created issue ID(s) and URL(s) (`linear issue url <ID>`). Then point at
the status-driven flow — do **not** offer to plan it yourself in this session:

> *Issue utworzone (DEMO-123) — w Backlogu. Wpisz ID issue w nowej sesji lub
> wiadomości, aby rozpocząć planowanie.*

Planning, implementation, and review are driven by the issue's Linear status in
`nerd4rent:linear-issue-workflow` — keep creation and planning as separate,
deliberate steps.

## Related skills

- `linear-cli` — CLI reference (always before `linear` commands).
- `nerd4rent:linear-issue-workflow` — downstream: status-driven planning and
  implementation of an issue ID produced here.
- `mattpocock-skills:grilling` (optional, `npx skills` / `~/.agents/skills`) —
  question formats for the inline grilling protocol; degrade gracefully when
  absent.
- `nerd4rent:new-project-workflow` — bootstraps a whole project; routes to
  spec-creating skills. This skill is the issue-level counterpart.
