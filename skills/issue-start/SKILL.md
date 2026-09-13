---
name: issue-start
model: haiku
description: >-
  Mechanically start work on a tracker issue (Linear, GitHub Issues, GitLab
  Issues, Azure DevOps Boards) already in
  the in-progress phase: read the issue's branch name, create the branch from a clean main/master
  checkout, make the empty start-of-work commit, push with upstream, and open a
  draft PR (GitHub, Azure DevOps) or MR (GitLab) carrying the `Fixes <ID>`
  magic word. Purely
  procedural with explicit commands and no multi-step reasoning — pinned to
  Haiku (the `model` frontmatter above) to keep it cheap. Invoked by
  issue-workflow's Start step, or directly when the user asks to start an
  issue ("zacznij", "rozpocznij", "start DEMO-123", "start #123", "open the PR
  for").
  Tracker and VCS commands come from the platform adapters.
---

# Issue start

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

The status strategy and map come from the `statuses` block of the platform
(same sources, same order), else the tracker adapter's `## Statuses` default;
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` defines how a value maps to a
phase. A strategy whose `## Status strategies` row is `—` → stop and report
"strategy not supported — run `/bind-statuses`".

The tracker adapter is used for two reads (`issue.read-status`,
`issue.read-branch`) and one branch operation (`issue.create-branch`), and
writes no status. `branchName` is the branch name the tracker derives from
the issue (already safe for git).

## Inputs

- `<ID>` — the issue identifier passed by the caller, in the form the tracker
  adapter's `## Issue ID` section gives (`DEMO-123` on Linear, `#123` on GitHub
  Issues, GitLab Issues and Azure DevOps Boards).
  If none was passed, stop and ask for it — never guess it.
- `<summary>` — an optional one-paragraph summary for the PR/MR body, passed
  by the caller. When absent, use the issue title.

## Preconditions — check all, stop on the first that fails

1. **The issue is in the `in-progress` phase.** Run `issue.read-status` and
   look the value up in the status map; it must be `in-progress`. Any other
   phase, or a value the map does not hold → stop and report it: this is the
   same approval gate `issue-workflow` enforces, and only the user moves the
   issue there.
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

Then run `issue.read-branch` and call its values `<ID>`, `<title>`,
`<branchName>` and `<url>` below.

## Step 1 — Branch

Run `issue.create-branch` with `<ID>`, `<branchName>` and `<base>` — the
branch checked in precondition 2. It leaves the new branch checked out.

If the branch already exists, the operation fails — stop and report: the
issue was started before, and `issue-workflow` skips Start in that case.

## Step 2 — Empty start commit and push

The VCS host needs at least one commit to open a PR/MR:

```bash
git commit --allow-empty -m "Rozpoczęcie prac nad <ID>"
git push -u origin <branchName>
```

The message is fixed: Polish, noun form, **no co-author, no model or tool
attribution**.

## Step 3 — Open the draft PR/MR

Run `pr.create-draft` from the VCS adapter with the title `<ID>: <title>` and
the body exactly as its `## Magic words` section prescribes — it starts with
the line `Fixes <ID>` (one line per issue if the PR closes several) and ends
with `<summary>`; a host without a tracker integration adds the issue
`<url>`, obtained as the tracker adapter's `## URL` section describes. Pass the body in the argument
form the operation's notes give. Print the PR/MR URL as the VCS adapter's
`## URL` section describes.

## Report

Confirm briefly what happened: branch `<branchName>` created and pushed,
start commit made, draft PR/MR opened (print its URL). If any step stopped
early, report which one and why — the caller decides what to do next.

## Related skills

- `nerd4rent:issue-workflow` — the status-driven workflow whose Start step
  delegates here once the user has moved the issue to `in-progress`.
- `nerd4rent:issue-close` — the mirror chain at the other end of the issue:
  commit, push, merge, switch to base, write `done`.
- `nerd4rent:determine-platform` — records the platform this skill reads.
