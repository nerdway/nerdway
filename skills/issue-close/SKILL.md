---
name: issue-close
model: haiku
description: >-
  Mechanically close out a tracker issue (Linear, GitHub Issues, GitLab
  Issues, Azure DevOps Boards, Jira Cloud) once the work
  is done: check the guide outcome the caller recorded with
  nerd-personal-docs (verified or not needed continues; pending merges with
  Refs and leaves the issue In Review; else it stops), check that every child of the issue is done (an unfinished child
  stops it before the merge), check that the PR/MR description is no longer
  the start draft (the caller writes the readiness description first), commit any
  leftover changes, push, merge the PR (GitHub, Azure DevOps) or MR (GitLab),
  switch the
  checkout to the PR/MR base branch, and move the issue to done. Purely
  procedural with explicit commands, pinned to Haiku (the `model`
  frontmatter above) to keep it cheap. Invoked by
  issue-workflow's close-out, or directly when the user asks to
  close/merge/finish an issue ("domknij", "zamknij", "zmerguj i zamknij", "close
  out", "merge and close"). Tracker and VCS commands come from the platform
  adapters.
---

# Issue close-out

A deterministic, mechanical close-out. Every step is an explicit command — run
them in order, stop and report on the first error. **Do not resolve merge
conflicts, deviate from the merge commands, or improvise** — those are out of
scope; report and stop instead.

## Platform and adapters

Tracker and VCS commands live in two adapter files at the plugin root. Read
both before Step 1, then run each operation by its ID from the adapter's
`## Operations` table:

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
${CLAUDE_PLUGIN_ROOT}/adapters/vcs/<vcs>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

Pick `<tracker>` and `<vcs>` from the first source that has them:

1. the platform the caller passed;
2. the nerdway platform config, read from disk as
   `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes, never from context;
3. the entity page frontmatter `platform:` — a legacy `linear:` block there
   means `tracker: linear`.

- No tracker from any source → stop and report: "no platform configured —
  run `/determine-platform`".
- No VCS from any source → detect it from `git remote get-url origin` with
  the `## Detection` rules of the VCS adapters.
- No adapter file for the value → stop and report: "adapter
  `trackers/<tracker>` (or `vcs/<vcs>`) is not available yet in this plugin
  version".
- An operation whose command is `—` → stop and report it, except
  `pr.mark-ready`, which is then skipped (Step 3).

The status strategy and map come from the `statuses` block of the platform
(same sources, same order), else the tracker adapter's `## Statuses` default;
`${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` defines how a value maps to a
phase and defines *Clickable links* for all reports. A strategy whose `## Status strategies` row is `—` → stop and report
"strategy not supported — run `/bind-statuses`".

The tracker adapter is used for one write (`issue.set-status`), the reads
of Step 0 (`issue.read`) and Step 0b (`issue.read-relations`,
`issue.read-status`), the issue link (`issue.url`) and, when no ID was
passed, `issue.resolve-from-branch`. Step 0c reads the PR/MR description with
the VCS adapter's `pr.view`.

## Resolve the issue ID

Use the ID passed by the caller. If none was passed, run
`issue.resolve-from-branch` — the tracker adapter's `## Issue ID` section
explains why every candidate is confirmed before use.

**If no candidate resolves, stop and ask the user for the ID** — never guess it.

Call it `<ID>` below.

## Step 0 — Guide check (gate)

This skill never writes the guide. The caller writes it beforehand with
`nerdway:nerd-personal-docs` on the session model (`issue-workflow`'s
close-out, `auto-issue-mode`'s close-out stage) and records the outcome as a
`## Personal guide` comment; this step only reads that comment. A guide file
found by a search is not enough: only the verify line on the issue proves it
reached the live wiki.

1. Run `issue.read`, take the comment bodies oldest first as a JSON array of
   strings (GitHub's `issue.read` JSON may be passed as it is) and pipe them
   to the reader:

   ```bash
   <comments JSON> | node ${CLAUDE_PLUGIN_ROOT}/scripts/pending-vault.ts outcome
   ```

   If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
   directories up from this skill's base directory. It prints the newest
   `## Personal guide` outcome as JSON with a `kind`.
2. `verified` (a `Guide:` line with the `Verified:` line of the verify
   command) or `not-needed` → note the guide path or the reason for the
   Report and go to Step 0b.
3. `pending` (`Pending: <path>`: no live wiki was reachable and the guide is
   queued on the issue) → note **guide pending** and go to Step 0b. Step 2b
   switches the magic word before the merge, and Step 5 writes `in-review`
   instead of `done`.
4. Anything else (`none`, or `unverified`: a `Guide:` line without
   `Verified:`) → stop — commit, push and merge nothing — and report exactly:

   > No verified guide for [<ID>](<url>): the issue has no `## Personal guide`
   > comment with `Verified:`, `Pending:` or `Not needed:`. Run
   > `nerdway:nerd-personal-docs <ID>` first, then run the close-out again.

## Step 0b — Children check (gate)

An issue whose children are not finished is never closed: closing the parent
can close its children on some trackers, with no work done in them. The
tracker adapter's `## Children on close` section says where the children are
and what the tracker does to them.

1. Run `issue.read-relations` on `<ID>` and take its children. No children →
   go to Step 0c.
2. For each child, run `issue.read-status` and look the value up in the
   status map, and run `issue.url` for its link.
3. Every child in phase `done` → go to Step 0c.
4. Otherwise stop — commit, push and merge nothing, and write no phase — and
   report exactly, one line per child that is not `done`, with its phase or
   `phase unknown` for a value the map does not hold:

   > [<ID>](<url>) has children that are not done:
   > - [<child ID>](<child url>) (`<phase>`)
   >
   > Finish each child or detach it from [<ID>](<url>), then run the
   > close-out again.

## Step 0c — Readiness description check (gate)

This skill never writes the PR/MR description. The caller rewrites it for
human reviewers beforehand (`issue-workflow` step 6b, `auto-issue-mode`
stage 4); this step only checks that the description is no longer the start
draft `issue-start` wrote.

1. Pipe the output of `pr.view` through the classifier:

   ```bash
   <pr.view command> | node ${CLAUDE_PLUGIN_ROOT}/scripts/pr-body-state.ts
   ```

   It prints one word: `draft`, `readiness` or `manual`. Both the collapsed
   layout (Summary plus a Details block) and the flat layout count as
   `readiness` when they carry the marker.
2. `readiness` (the readiness description, with its marker) or `manual` (a
   description someone wrote by hand) → note the word for the Report and go
   to Step 1.
3. `draft` → stop — commit, push and merge nothing, and write no phase — and
   report exactly:

   > The PR/MR description of [<ID>](<url>) is still the start draft (`Fixes <ID>`
   > and one paragraph). Write the readiness description with
   > `nerdway:issue-workflow` step 6b, then run the close-out again.

## Step 1 — Commit leftover changes (skip if clean)

```bash
git status --porcelain
```

- **Empty output** → nothing to commit, go to Step 2.
- **Non-empty** → commit everything with a repo-convention message (Polish,
  noun form: `Dodanie…`, `Poprawa…`, `Aktualizacja…`; **no co-author, no
  self-attribution**). Derive the summary from the changed files or the issue
  title:

  ```bash
  git add -A
  git commit -m "<PL, forma rzeczownikowa — krótkie podsumowanie zmian>"
  ```

## Step 2 — Push

```bash
git push
```

If it fails because there is no upstream, set it:

```bash
git push -u origin "$(git branch --show-current)"
```

## Step 2b — Keep the issue open while the guide is pending (only when Step 0 noted guide pending)

Skip this step unless Step 0 noted **guide pending**. A merged `Fixes <ID>`
would close the issue on GitHub, GitLab and Azure DevOps and through the
Linear integration, before the guide exists. Switch the magic-word line to
the non-closing `Refs <ID>` (the VCS adapter's `## Magic words`):

1. Write the new description to a file:

   ```bash
   <pr.view command> | node ${CLAUDE_PLUGIN_ROOT}/scripts/pr-body-state.ts --refs > <file>
   ```

2. Replace the description with `pr.edit-body` and `<file>`.
3. Check it:

   ```bash
   <pr.view command> | node ${CLAUDE_PLUGIN_ROOT}/scripts/pr-body-state.ts --magic
   ```

   `refs` → go to Step 3. Anything else, or a failed edit → stop before the
   merge and report the error.

## Step 3 — Merge

From the VCS adapter, in this order:

1. `pr.view-base` — **before merging**; capture the base branch for Step 4,
   the draft flag, and the PR `<id>` when the adapter returns one.
2. `pr.mark-ready` — only when `pr.view-base` reports a draft
   (`isDraft: true`); when the adapter lists `—` for it, this step is skipped.
3. `pr.merge` — exactly as the adapter gives it, with the `<id>` from step 1
   when its command takes one: a **merge commit** is the only method this
   workflow uses.

If the merge fails (conflicts, protected branch, branch policy, insufficient
permissions), **stop and report the error** — do not attempt to resolve or
bypass it.

## Step 4 — Switch to the base branch and sync

Use the base branch captured in Step 3 — **do not assume `main`**:

```bash
git checkout <base> && git pull
```

## Step 5 — Move the issue to `done` (or `in-review` while the guide is pending)

With **guide pending** from Step 0, write the phase `in-review` with
`issue.set-status` instead of `done`, and report "guide pending on [<ID>](<url>):
the merge is done, the issue stays In Review until
`nerdway:nerd-personal-docs drain` writes and verifies the guide on a
workstation". Otherwise:


Run `issue.set-status` from the tracker adapter with the phase `done`: the
write recipe of the resolved strategy with `map.done` (`Done` on Linear and
on Jira Cloud by default, `closed` on GitHub Issues and GitLab Issues under
`label`, the project's Done Status option under GitHub `native`, the
`Closed` board column on Azure DevOps Boards by default). On GitHub
`native` the write sets that Done option and closes the issue, so a merged
`Fixes #<n>` and this step agree.

This is idempotent and deterministic: it closes the issue independently of
magic-word timing and covers hosts with no tracker auto-close. An issue the
merge already closed is closed again without error.

## Report

Confirm briefly what happened, formatting every identifier as a clickable
Markdown link per *Clickable links* and *Asking the human to move a phase*
in `${CLAUDE_PLUGIN_ROOT}/adapters/statuses.md` (never a bare ID beside a
URL): the guide check (the guide path with its verify line, the not-needed
reason, or guide pending with the `Refs` switch), the children check (no
children, or how many, all done), the description check (`readiness` or
`manual`), committed (or clean), pushed, merged (`[PR #<n>](<prUrl>)` /
`[MR !<n>](<mrUrl>)`, commit `[<shortSha>](<commitUrl>)`), now on
`[<base>](<branchUrl>)`, and `[<ID>](<url>)` moved to done (or left In
Review with the guide pending). If any step stopped early, report which one
and why with `[<ID>](<url>)`.

## Related skills

- `nerdway:issue-workflow` — the status-driven workflow whose close-out
  phase delegates here.
- `nerdway:nerd-personal-docs` — writes the guide Step 0 checks; the
  caller runs it before this skill, on the session model.
- `nerdway:issue-start` — the mirror chain at the other end of the issue:
  branch, start commit, push, draft PR/MR.
- `nerdway:determine-platform` — records the platform this skill reads.
