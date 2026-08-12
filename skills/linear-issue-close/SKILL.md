---
name: linear-issue-close
model: haiku
description: >-
  Mechanically close out a Linear issue once the work is done: commit any
  leftover changes, push, merge the PR (GitHub) or MR (GitLab), switch the local
  checkout to the PR/MR base branch, and set the Linear issue to Done. Purely
  procedural with explicit commands and no multi-step reasoning — pinned to Haiku
  (the `model` frontmatter above) to keep it cheap. Invoked by
  linear-issue-workflow's close-out, or directly when the user asks to
  close/merge/finish an issue ("domknij", "zamknij", "zmerguj i zamknij", "close
  out", "merge and close"). The Linear command is in the CLI reference.
---

# Linear issue close-out

A deterministic, mechanical close-out. Every step is an explicit command — run
them in order, stop and report on the first error. **Do not resolve merge
conflicts, deviate from the merge commands below, or improvise** — those are
out of scope; report and stop instead.

## CLI reference

`linear` is `joa23/linear-cli` (Go). This skill issues exactly one write:

```bash
linear issues update <ID> --state Done
```

`Done` is the team's own state **name**, not a state type — list a team's names
with `linear teams states <KEY>`.

There is no command mapping a branch back to an issue, so the ID is parsed from
the branch name and every candidate is confirmed with a read before use:

```bash
linear issues get <ID> -f minimal -o json
```

It exits non-zero for an ID that does not exist, which is what makes the
resolution below safe.

## Resolve the issue ID

Use the ID passed by the caller. If none was passed, read it from the current
branch:

```bash
for candidate in $(git branch --show-current | grep -oiE '[a-z]+-[0-9]+' | tr '[:lower:]' '[:upper:]'); do
  linear issues get "$candidate" -f minimal -o json >/dev/null 2>&1 && { echo "$candidate"; break; }
done
```

Matching is case-insensitive because `linear issues slug` produces lowercase
branch names; the result is upper-cased because Linear expects `DEMO-123`.

Every `letters-digits` fragment is a *candidate*, and the first one that
actually resolves in Linear wins. Taking the leftmost match alone is not safe:
a branch named `sprint-24-demo-456-fix` yields `SPRINT-24` before `DEMO-456`, and
that wrong-but-plausible ID would flow into the Done write below and close
somebody else's issue. Resolving each candidate also keeps older branches
working — a `pawel/demo-123-tytul` branch from the previous CLI still lands on
`DEMO-123`.

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
- Merge with a **merge commit** — the only method this workflow uses (the
  branch's atomic commits must survive the merge):

  ```bash
  gh pr merge --merge
  ```

### GitLab

```bash
# target (base) branch of the MR — capture for Step 4
glab mr view
```

Pass no method-selection flags — the project's merge-method setting decides,
and a **merge commit** is the expected configuration:

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
linear issues update <ID> --state Done
```

This is idempotent and deterministic: it closes the issue on GitHub (independent
of magic-word timing) and covers GitLab, where there is no Linear↔GitHub
auto-close.

## Report

Confirm briefly what happened: committed (or clean), pushed, merged,
now on `<base>`, issue `<ID>` set to Done. If any step stopped early, report
which one and why.

## Related skills

- `nerd4rent:linear-issue-workflow` — the status-driven workflow whose close-out
  phase delegates here.
