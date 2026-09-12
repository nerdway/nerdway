---
name: issue-start
model: haiku
description: >-
  Mechanically start work on a Linear issue that is already In Progress: read
  the issue's native branch name, create the branch from a clean main/master
  checkout, make the empty start-of-work commit, push with upstream, and open a
  draft PR (GitHub) or MR (GitLab) carrying the `Fixes <ID>` magic word. Purely
  procedural with explicit commands and no multi-step reasoning — pinned to
  Haiku (the `model` frontmatter above) to keep it cheap. Invoked by
  issue-workflow's Start step, or directly when the user asks to start an
  issue ("zacznij", "rozpocznij", "start DEMO-123", "open the PR for"). The
  Linear command is in the CLI reference.
---

# Linear issue start

A deterministic, mechanical Start. Every step is an explicit command — run
them in order, stop and report on the first error. **Do not ask the user
questions, resolve branch conflicts, deviate from the commands below, or
improvise** — those are out of scope; report and stop instead.

## CLI reference

`linearis` is the Linear CLI (npm, JSON-only output). This skill issues
exactly one read and no writes:

```bash
linearis issues read <ID> --fields identifier,title,branchName,state.name
```

`--fields` trims the JSON to those keys. `branchName` is the branch name
Linear derives from the issue (lowercase, already safe for git); `state.name`
is the team's own state name, e.g. `In Progress`.

## Inputs

- `<ID>` — the Linear issue identifier passed by the caller (e.g. `DEMO-123`).
  If none was passed, stop and ask for it — never guess it.
- `<summary>` — an optional one-paragraph summary for the PR/MR body, passed
  by the caller. When absent, use the issue title.

## Preconditions — check all, stop on the first that fails

1. **The issue is In Progress.** Run the read above; `state.name` must equal
   `In Progress`. Any other status → stop and report it: this is the same
   approval gate `issue-workflow` enforces, and only the user moves the status.
2. **The checkout is on `main` or `master`:**

   ```bash
   git branch --show-current
   ```

   Anything else → stop and report the current branch. Deciding whether to
   branch from another issue branch is the caller's job, not this skill's.
3. **The working tree is clean:**

   ```bash
   git status --porcelain
   ```

   Non-empty output → stop and report; leftover changes would land in the
   start commit of the wrong issue.

Call the values from the read `<ID>`, `<title>` and `<branchName>` below.

## Step 1 — Branch

```bash
git checkout -b <branchName>
```

If the branch already exists, the command fails — stop and report: the
issue was started before, and `issue-workflow` skips Start in that case.

## Step 2 — Empty start commit and push

GitHub and GitLab need at least one commit to open a PR/MR:

```bash
git commit --allow-empty -m "Rozpoczęcie prac nad <ID>"
git push -u origin <branchName>
```

The message is fixed: Polish, noun form, **no co-author, no model or tool
attribution**.

## Step 3 — Detect platform and open the draft PR/MR

Detect GitHub vs GitLab from the origin remote:

```bash
git remote get-url origin
```

- Host contains `github.com` → **GitHub** (use `gh`).
- Host contains `gitlab` → **GitLab** (use `glab`).
- Ambiguous → fall back to whichever CLI is installed (`command -v gh` /
  `command -v glab`). If the needed CLI is missing, **stop and report**.

The body starts with the magic word line `Fixes <ID>` (one line per issue if
the PR closes several), then a blank line, then `<summary>` — this is what
lets the Linear integration track the PR/MR and auto-close the issue on merge.

### GitHub

```bash
gh pr create --draft --title "<ID>: <title>" --body "Fixes <ID>

<summary>"
```

### GitLab

```bash
glab mr create --draft --yes --title "<ID>: <title>" --description "Fixes <ID>

<summary>"
```

## Report

Confirm briefly what happened: branch `<branchName>` created and pushed,
start commit made, draft PR/MR opened (print its URL). If any step stopped
early, report which one and why — the caller decides what to do next.

## Related skills

- `nerd4rent:issue-workflow` — the status-driven workflow whose Start step
  delegates here once the user has set the issue In Progress.
- `nerd4rent:issue-close` — the mirror chain at the other end of the issue:
  commit, push, merge, switch to base, set Done.
