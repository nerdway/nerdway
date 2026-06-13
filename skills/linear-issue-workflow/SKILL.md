---
name: linear-issue-workflow
description: >-
  Mandatory workflow for Linear issues when the user asks to plan or implement
  work and provides an issue ID (e.g. KAM-145, ENG-123). Fetches the issue,
  posts an implementation plan comment before coding, gates repo changes until
  approval, and posts session summaries. Invoke this skill FIRST; use linear-cli
  for CLI syntax. Overrides "implement now" phrasing until plan is posted or an
  approved implementation comment exists.
---

# Linear issue workflow

Use with the `linear-cli` skill for every `linear` command (flags, subcommands).

## When this skill applies

The user gave a **Linear issue identifier** (`TEAM-123`) and wants to **plan** or **implement** (including Polish: *zaplanuj*, *zrealizuj*, *zrób*, *weź*, *napraw*, *wdroż*).

Phrases like "zrealizuj od razu" or "just fix it" **do not** skip this workflow unless the issue already has an **approved implementation comment** (see markers below).

## Hard gates (do not skip)

1. **Before any repo change** (edit, write, build, install, commit, PR): complete steps 1–4 below.
2. **After every working session** on the issue: post a completion summary comment (step 8).

Allowed before plan approval: `linear issue view`, reading code for analysis, `SwitchMode` to Plan, drafting plan text, posting Linear comments, answering user questions.

## Markers in Linear comments

| Marker | Meaning |
|--------|---------|
| `## Implementation plan` | Plan posted; awaiting user approval |
| `Status: approved` | User approved; coding may start |
| `## Session summary` | End-of-session log (not a substitute for a plan) |

**Approved implementation comment** = a comment containing `## Implementation plan` **and** `Status: approved` (or explicit user confirmation in chat after the plan comment, then add `Status: approved` to the same thread).

## Workflow

### 1. Fetch issue

```bash
linear issue view <ID> -j
```

Read title, description, state, branch name, and **all comments**.

### 2. Choose path

| Condition | Action |
|-----------|--------|
| No comment with `## Implementation plan` | **Planning path** (steps 3–5) |
| Plan exists, no `Status: approved` | Present plan to user; QA only; **no repo edits** until approved |
| Plan + `Status: approved` | **Implementation path** (step 6+) |
| User only asked to "plan" | Planning path; stop after step 5 unless they approve in the same session |

### 3. Draft plan (required sections)

Write the plan with these headings (Polish or English — match the issue language):

- **Objective**
- **Scope** (in / out)
- **Technical Approach**
- **Implementation Steps**
- **Acceptance Criteria**
- **Risks**
- **Dependencies**

For ambiguous requirements, ask the user **before** posting the plan (short QA).

Use Plan mode in Cursor when the task is large or has trade-offs.

### 4. Post plan to Linear

Save the plan to a temp file, then:

```bash
linear issue comment add <ID> --body-file <path-to-plan.md>
```

The posted body **must** start with:

```markdown
## Implementation plan

Status: pending approval
```

Tell the user: *Plan jest w Linear — potwierdź proszę (lub napisz poprawki), zanim zmienię kod.*

### 5. Wait for approval

Do **not** edit the repository until:

- the user confirms in chat, **and**
- you add a reply or edit: `Status: approved` on the plan thread (new comment is fine):

```bash
linear issue comment add <ID> --body "Status: approved — rozpoczynam implementację."
```

### 6. Branch policy (before first commit)

1. **On `main` / `master`**: create branch from Linear (`branchName` from `issue view -j`), e.g. `git checkout -b kam-145-brak-interfejsu-aplikacji`.
2. **On another issue branch**: ask the user:
   - (a) new branch from current branch?
   - (b) new branch from main/master?
   - (c) leave as-is?

### 7. Implement

Follow project conventions. Prefer minimal scope. Run relevant tests/builds.

Optionally mark in progress:

```bash
linear issue start <ID>
```

### 8. Session summary (mandatory)

After each session (including partial work), post:

```bash
linear issue comment add <ID> --body-file <summary.md>
```

Body **must** start with `## Session summary` and include:

- what changed (files / areas),
- scope completed vs remaining,
- current status,
- validation / test results,
- open questions / next steps.

The summary must be enough to resume from Linear alone.

## Planning-only requests

If the user asked only to **plan** (no implementation):

- Complete steps 1–5.
- Do **not** implement unless they approve in the same or a follow-up message.

## Related skills

- `linear-cli` — CLI reference (always before `linear` commands).
- `gitlab-to-linear` / `simgit` — GitLab → Linear import (separate flow).
