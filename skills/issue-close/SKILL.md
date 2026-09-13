---
name: issue-close
model: haiku
description: >-
  Mechanically close out a Linear issue once the work is done: commit any
  leftover changes, push, merge the PR (GitHub) or MR (GitLab), switch the local
  checkout to the PR/MR base branch, and set the Linear issue to Done. Purely
  procedural with explicit commands and no multi-step reasoning — pinned to Haiku
  (the `model` frontmatter above) to keep it cheap. Invoked by
  issue-workflow's close-out, or directly when the user asks to
  close/merge/finish an issue ("domknij", "zamknij", "zmerguj i zamknij", "close
  out", "merge and close"). Tracker and VCS commands come from the platform
  adapters.
---

# Linear issue close-out

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
- An operation whose command is `—` → stop and report it, except
  `pr.mark-ready`, which is then skipped (Step 3).

The tracker adapter is used for one write (`issue.set-status`) and, when no
ID was passed, `issue.resolve-from-branch`.

## Resolve the issue ID

Use the ID passed by the caller. If none was passed, run
`issue.resolve-from-branch` — the tracker adapter's `## Issue ID` section
explains why every candidate is confirmed before use.

**If no candidate resolves, stop and ask the user for the ID** — never guess it.

Call it `<ID>` below.

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

## Step 3 — Merge

From the VCS adapter, in this order:

1. `pr.view-base` — **before merging**; capture the base branch for Step 4.
2. `pr.mark-ready` — only when `pr.view-base` reports a draft (GitHub
   `isDraft: true`); on GitLab the adapter lists no command and this step is
   skipped.
3. `pr.merge` — exactly as the adapter gives it: a **merge commit** is the
   only method this workflow uses.

If the merge fails (conflicts, protected branch, insufficient permissions),
**stop and report the error** — do not attempt to resolve it.

## Step 4 — Switch to the base branch and sync

Use the base branch captured in Step 3 — **do not assume `main`**:

```bash
git checkout <base> && git pull
```

## Step 5 — Set the Linear issue to Done

Run `issue.set-status` from the tracker adapter with the state name for
*Closed* from its `## Statuses` table (`Done` on Linear).

This is idempotent and deterministic: it closes the issue independently of
magic-word timing and covers hosts with no tracker auto-close.

## Report

Confirm briefly what happened: committed (or clean), pushed, merged,
now on `<base>`, issue `<ID>` set to Done. If any step stopped early, report
which one and why.

## Related skills

- `nerd4rent:issue-workflow` — the status-driven workflow whose close-out
  phase delegates here.
- `nerd4rent:issue-start` — the mirror chain at the other end of the issue:
  branch, start commit, push, draft PR/MR.
- `nerd4rent:determine-platform` — records the platform this skill reads.
