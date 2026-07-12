---
name: linear-issue-close
description: >-
  Mechanically close out a Linear issue once the work is done: commit any
  leftover changes, push, merge the PR (GitHub) or MR (GitLab), switch the local
  checkout to the PR/MR base branch, and set the Linear issue to Done. Purely
  procedural with explicit commands and no multi-step reasoning — cheap enough to
  run on a fast model (Haiku). Invoked by linear-issue-workflow's close-out, or
  directly when the user asks to close/merge/finish an issue ("domknij",
  "zamknij", "zmerguj i zamknij", "close out", "merge and close"). Use linear-cli
  for the Linear command.
---

# Linear issue close-out

A deterministic, mechanical close-out. Every step is an explicit command — run
them in order, stop and report on the first error. **Do not resolve merge
conflicts, pick non-default merge strategies, or improvise** — those are out of
scope; report and stop instead.

Use the `linear-cli` skill for the `linear` command syntax.

## Resolve the issue ID

Use the ID passed by the caller. If none was passed, read it from the current
branch:

```bash
linear issue id
```

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

## Step 3 — Detect platform and merge

Detect GitHub vs GitLab from the origin remote:

```bash
git remote get-url origin
```

- Host contains `github.com` → **GitHub** (use `gh`).
- Host contains `gitlab` → **GitLab** (use `glab`).
- Ambiguous → fall back to whichever CLI is installed (`command -v gh` /
  `command -v glab`). If the needed CLI is missing, **stop and report**.

**Read the base branch BEFORE merging** (needed for Step 4) and merge:

### GitHub

```bash
# base branch of the PR — capture for Step 4
gh pr view --json baseRefName,isDraft
```

- If `isDraft` is `true` → mark it ready first: `gh pr ready`.
- Merge with the repo's default method. Detect the allowed methods and pick, in
  preference order, squash → merge → rebase (this respects the repo settings and
  never forces a disabled method):

  ```bash
  gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed
  ```

  Then run exactly one of:

  ```bash
  gh pr merge --squash   # if squashMergeAllowed
  gh pr merge --merge    # else if mergeCommitAllowed
  gh pr merge --rebase   # else if rebaseMergeAllowed
  ```

### GitLab

```bash
# target (base) branch of the MR — capture for Step 4
glab mr view
```

Merge with the project's default method:

```bash
glab mr merge --yes
```

If the merge fails (conflicts, protected branch, insufficient permissions),
**stop and report the error** — do not attempt to resolve it.

## Step 4 — Switch to the base branch and sync

Use the base/target branch captured in Step 3 (`baseRefName` on GitHub, the
target branch on GitLab) — **do not assume `main`**:

```bash
git checkout <base> && git pull
```

## Step 5 — Set the Linear issue to Done

```bash
linear issue update <ID> -s Done
```

This is idempotent and deterministic: it closes the issue on GitHub (independent
of magic-word timing) and covers GitLab, where there is no Linear↔GitHub
auto-close.

## Report

Confirm briefly what happened: committed (or clean), pushed, merged (method),
now on `<base>`, issue `<ID>` set to Done. If any step stopped early, report
which one and why.

## Related skills

- `linear-cli` — CLI reference for the `linear` command.
- `nerd4rent:linear-issue-workflow` — the status-driven workflow whose close-out
  phase delegates here.
