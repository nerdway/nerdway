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
  issue ("zacznij", "rozpocznij", "start DEMO-123", "open the PR for").
  Tracker and VCS commands come from the platform adapters.
---

# Linear issue start

A deterministic, mechanical Start. Every step is an explicit command — run
them in order, stop and report on the first error. **Do not ask the user
questions, resolve branch conflicts, deviate from the commands below, or
improvise** — those are out of scope; report and stop instead.

## Platform and adapters

Tracker and VCS commands live in two adapter files at the plugin root. Read
both before the preconditions, then run each operation by its ID from the
adapter's `## Operations` table:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
${CLAUDE_PLUGIN_ROOT}/adapters/vcs/<vcs>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

Pick `<tracker>` and `<vcs>` from the first source that has them:

1. the platform the caller passed;
2. the `## Platform` section of the repo `CLAUDE.md`;
3. the entity page frontmatter `platform:` — a legacy `linear:` block there
   means `tracker: linear`.

- No tracker from any source → stop and report: "no platform configured —
  run `/determine-platform`".
- No VCS from any source → detect it from `git remote get-url origin` with
  the `## Detection` rules of the VCS adapters.
- No adapter file for the value → stop and report: "adapter
  `trackers/<tracker>` (or `vcs/<vcs>`) is not available yet in this plugin
  version".
- An operation whose command is `—` → stop and report it.

The tracker adapter is used for exactly one read (`issue.read-branch`) and no
writes. Its `branchName` is the branch name the tracker derives from the
issue (already safe for git); `state.name` is the team's own state name from
the adapter's `## Statuses` table.

## Inputs

- `<ID>` — the Linear issue identifier passed by the caller (e.g. `DEMO-123`).
  If none was passed, stop and ask for it — never guess it.
- `<summary>` — an optional one-paragraph summary for the PR/MR body, passed
  by the caller. When absent, use the issue title.

## Preconditions — check all, stop on the first that fails

1. **The issue is In Progress.** Run `issue.read-branch`; `state.name` must
   equal `In Progress`. Any other status → stop and report it: this is the same
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

## Step 3 — Open the draft PR/MR

Run `pr.create-draft` from the VCS adapter with the title `<ID>: <title>` and
the body its `## Magic words` section prescribes — the line `Fixes <ID>` (one
line per issue if the PR closes several), a blank line, then `<summary>`. That
line is what lets the tracker integration track the PR/MR and auto-close the
issue on merge.

## Report

Confirm briefly what happened: branch `<branchName>` created and pushed,
start commit made, draft PR/MR opened (print its URL). If any step stopped
early, report which one and why — the caller decides what to do next.

## Related skills

- `nerd4rent:issue-workflow` — the status-driven workflow whose Start step
  delegates here once the user has set the issue In Progress.
- `nerd4rent:issue-close` — the mirror chain at the other end of the issue:
  commit, push, merge, switch to base, set Done.
- `nerd4rent:determine-platform` — records the platform this skill reads.
