---
name: project-continue
description: >-
  Answer "where are we" for the current project in one step: read the newest
  entry of `## Checkpoints` on the project's nerdbrain entity page, verify it
  against the repo (git) and Linear, report any drift, and — only with the
  user's consent, or when no checkpoint exists yet — record a fresh checkpoint.
  Use when the user switches to a project (also on another machine) and asks
  "gdzie jesteśmy", "na czym stanęliśmy", "kontynuuj projekt", "continue",
  "where were we", "what's the state of this project". Reports and hints at the
  issue ID to type; never enters linear-issue-workflow by itself.
---

# Linear continue: project checkpoints

One conversational pass: **read → verify → report → (ask) → write**. The
checkpoint lives on the entity page, so this skill works offline against the
vault and only reaches Linear for the status check and the active-issue list.
The write, when it happens, goes through the `nerdbrain-wiki` procedure
(section mode *Prepend, capped*, `updated:` bump, `log.md` line) — never
through ad-hoc file surgery.

## CLI reference

`linearis` is the Linear CLI (npm, JSON-only output). This skill only reads:

| Purpose | Command |
|---------|---------|
| Status of the checkpointed issue | `linearis issues read <ID> --fields identifier,title,state.name` |
| Active issues of the project | `linearis issues list --team <KEY> --project <PROJECT> --status 'Todo,In Progress,In Review' --fields nodes.identifier,nodes.title,nodes.state.name` |

`--project` accepts the project **UUID** from the entity page's
`linear.project` frontmatter as well as the project name. On `list` the
result is `{nodes: [...]}`, so `--fields` paths need the `nodes.` prefix —
`--fields identifier` returns `{}` with no error. `--status` requires
`--team`; states are the team's own **names** (`In Progress`, not
`started`).

Git commands, each proven in this repo with the exit codes relied on below:

| Purpose | Command | Exit |
|---------|---------|------|
| Refresh remote refs, drop deleted ones | `git fetch -q --prune` | — |
| Is the hash known here | `git cat-file -e <hash>^{commit}` | 0 known / 128 unknown |
| Does the branch exist | `git rev-parse --verify --quiet refs/heads/<branch>` then `refs/remotes/origin/<branch>` | 0 exists / 1 missing |
| Is the hash still in the branch history | `git merge-base --is-ancestor <hash> <ref>` | 0 ancestor / 1 not |
| Work done after the checkpoint | `git log --oneline <hash>..<ref>` | — |
| Local branch vs its remote | `git rev-list --left-right --count <branch>...origin/<branch>` | — |
| Default branch on origin | `git symbolic-ref --short refs/remotes/origin/HEAD` | — |

## Step 1 — Locate the checkpoint

The SessionStart inject names the project (`slug:`) and the vault tier. Build
the page path from the slug and **read the file itself** — the hook injects a
whitelist of sections and `## Checkpoints` is lazy, so it is never in the
inject and may even be cut by the byte budget:

```
Read ~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md
```

Take the first bullet under `## Checkpoints` (entries are newest first) and
split it on the format defined in `nerdbrain-wiki`:

```
- YYYY-MM-DD — <ISSUE-ID> · <Linear status> · <branch> @ <hash> — next: <one line>
```

Then branch on what you found:

- **`tier=none`, or no entity page for this project** → skip to
  [Step 5 — No checkpoint](#step-5--no-checkpoint) in read-only mode: state
  the situation from repo and Linear, say plainly that nothing was written
  because the vault is unreachable, and stop.
- **Page exists, but the section is missing or empty** → Step 5 with a write
  at the end.
- **An entry exists** → Step 2.

## Step 2 — Verify against git

Run `git fetch -q --prune` first; a checkpoint written on another machine
only makes sense against fresh remote refs, and without `--prune` a branch
deleted on origin after a merge keeps a stale `origin/<branch>` here and
looks alive. Then collect the **branch tips** that exist: `origin/<branch>`
and the local `<branch>`. Either may be missing; either may be ahead of the
other (a fast-forward pull due here, or unpushed work on this machine).

Walk the cases in this order and **stop at the first one that fires**: each
later check assumes the earlier ones passed (an unknown hash makes every
`merge-base` below exit 128; a missing branch leaves nothing to compare
against). Report the case that fired with its evidence — they mean different
things and call for different actions:

| # | Check | Meaning | Report as |
|---|-------|---------|-----------|
| 1 | `git cat-file -e <hash>^{commit}` → 128 | the fetch just ran, so the commit exists only on the machine that wrote the checkpoint — it was never pushed | "checkpoint commit not on origin — push it from the other machine; nothing to pull here" |
| 2 | no `origin/<branch>` **and** no local `<branch>` | the branch is gone; run `git merge-base --is-ancestor <hash> origin/<default>` — 0 means the work was merged, 1 means it was lost or rewritten. Without a resolvable `origin/<default>` (no remote, unset `origin/HEAD`) compare against `HEAD` instead | "branch merged (or: branch gone, hash not on `<default>`)" |
| 3 | `git merge-base --is-ancestor <hash> <tip>` → 1 for **every** existing tip | history was rewritten after the checkpoint | "hash is not in the branch history any more" |
| 4 | `git log --oneline <hash>..<ref>` is non-empty, where `<ref>` is the tip that contains the hash (`origin/<branch>` when both do) | work continued after the checkpoint (typically a session that never wrote one) | "N commits after the checkpoint" + the log |

Case 3 must test both tips: a checkpoint taken after a local commit that was
never pushed is an ancestor of the local branch but not of `origin/<branch>`,
and that is unpushed work, not a rewrite. An empty log in case 4 means git
and the checkpoint agree. When both tips exist, add one line from
`git rev-list --left-right --count <branch>...origin/<branch>`: local behind
means a fast-forward `git pull` is due, local ahead means unpushed work on
this machine — neither is drift in the checkpoint. Case 4 is what a lagging
Obsidian Sync looks like: the repo moved on, the page has not caught up yet.

## Step 3 — Verify against Linear

```bash
linearis issues read <ID> --fields identifier,title,state.name
```

Compare `state.name` with the status recorded in the entry. A difference is
drift on its own, reported separately from the git cases — an issue moved to
*In Review* or *Done* while the checkpoint still says *In Progress* is the
common one. A failed read (issue deleted, no auth) is reported as "Linear
status unknown", never as a match.

## Step 4 — Report

Print one compact block, always in this shape:

1. **Checkpoint** — the entry as recorded (date, issue, status, branch, hash,
   next step).
2. **Git** — "in sync" or the case from Step 2 with its evidence (the
   `git log` lines, the default-branch ancestry result, the local/remote
   ahead-behind count).
3. **Linear** — "in sync" or `recorded X, now Y`.
4. **Active issues** — the project's `Todo / In Progress / In Review` list from
   the CLI reference (team key and project from the page frontmatter), so the
   user sees the whole board, not only the checkpointed issue.
5. **One hint line** — *type `<ID>` to resume it with `linear-issue-workflow`*,
   naming the checkpointed issue (or the single In Progress one when the
   checkpoint is stale). The hint is all this skill does about the workflow:
   it never dispatches into it, since the status-driven flow has its own
   gates.

**No drift** (git in sync, Linear in sync): the report is the whole result.
Do not write anything — the checkpoint is still true.

**Drift** in any check: after the report, ask **one question**:
*"Record a new checkpoint from the current state (branch `<b>` @ `<hash>`,
`<ID>` `<status>`)? Suggested next step: `<…>`"* — with a recommended answer.
Without an explicit yes, **nothing is written**. On yes, write via
`nerdbrain-wiki` (Step 6) with the current values, and let the user correct
the "next" line before writing if they want to.

## Step 5 — No checkpoint

Establish the state from the two sources the checkpoint would have summarised:

```bash
linearis issues list --team <KEY> --project <PROJECT> --status 'Todo,In Progress,In Review' --fields nodes.identifier,nodes.title,nodes.state.name
git status --short
git branch --show-current
git log --oneline -5
```

Show the result in the Step 4 shape (sections 4 and 5, plus the git state),
then — page present, vault reachable — record the first checkpoint without
asking: the section was empty, so there is nothing to overwrite and the entry
only captures what was just shown. Pick the issue for the entry in this order:
the issue whose branch is checked out (ID parsed from the branch name and
confirmed with `linearis issues read`), else the single *In Progress* issue,
else ask which one. With `tier=none` or no page, stop after the report and say
so.

## Step 6 — Write (via `nerdbrain-wiki`)

Invoke `nerdbrain-wiki` and follow its **Prepend, capped** mode for
`## Checkpoints`: new bullet directly under the heading, the newest 10 kept,
`updated:` bumped, one line appended to `log.md`. Field values:

- date — today;
- issue ID and status — from the Linear read;
- branch and hash — `git branch --show-current` and `git rev-parse --short HEAD`
  (after a fetch, and after any commit the user just made);
- next — one line, English, taken from the user's answer or from the newest
  `## Session summary` comment on the issue when the user gave none.

If the page has `## Decisions` and `## Active context` but no
`## Checkpoints` heading, add the heading between them first, exactly as
`nerdbrain-wiki` describes.

## Boundaries

- **Never write without consent when an entry exists.** Drift is reported and
  asked about; a silent overwrite would race Obsidian Sync, which may still be
  about to deliver a newer entry from another machine.
- **`tier=none` or no entity page → zero writes**, full stop. The state report
  from repo and Linear is still produced.
- **Vault access is filesystem-only** (`Read`/`Edit` on the vault path, `rg`
  for search) — no Obsidian/Linear MCP, no Local REST API, no git against the
  vault (ADR-0001, `~/.claude/CLAUDE.md`).
- **Linear is read-only here.** Status changes belong to the user in Linear,
  or to `linear-issue-workflow` / `linear-issue-close`.
- **The injected page stays authoritative** for stack, commands and
  conventions; this skill narrows the "is it current?" question to one
  section and one entry.

## Related skills

- `nerd4rent:nerdbrain-wiki` — defines the `## Checkpoints` entry format and
  the Prepend, capped write mode this skill delegates to.
- `nerd4rent:linear-issue-workflow` — writes a checkpoint in its mandatory
  session-summary step, which is what keeps the history growing; type the
  issue ID from the report to enter it.
- `nerd4rent:nerdbrain-search` — `rg` recipes if the page has to be found by
  content rather than by slug.
