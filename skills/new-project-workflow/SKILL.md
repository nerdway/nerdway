---
name: new-project-workflow
description: Bootstrap a new development project end-to-end — resolve the target directory, initialize git, scaffold README.md, create a GitHub repo via gh, create a matching Linear project, optionally record the project in a nerdbrain wiki, then route the user to a spec-creating skill of their choice. Use whenever the user wants to "start a new project", "bootstrap a project", "kick off a new repo", "set up a new project the nerd4rent way", or invokes /nerd4rent:new-project-workflow. Also use proactively when the user is sitting in an empty or near-empty directory and signals they're about to begin fresh work (e.g. "let's build X", "new idea I want to start on"), even if they don't say "workflow" explicitly.
---

# new-project-workflow

This skill bootstraps a new project in **one approval gate**. The user reviews a single plan; everything else runs automatically.

## Why one approval gate

People reaching for this skill have already decided to start a project. They don't want five separate y/n prompts for git init, README, gh, Linear, and spec routing — they want to read the plan once, say yes, and have everything wired up. The cost of getting one of these steps wrong is low (each is reversible), so the friction of per-step confirmation isn't worth it. Save interruptions for genuinely ambiguous decisions: which Linear team, which spec skill, and any name/visibility choices not already supplied as flags.

## Core principle — every step is idempotent

The skill must be safe to re-run on a partially-set-up project. Before *any* step runs, inspect whether its effect already exists. If it does: skip and surface the existing artifact (URL, file, commit) in the plan. Never overwrite, never `--force`, never create duplicates.

This applies to git init, README, GitHub repo, Linear project, and the nerdbrain entity page.

## Inputs

The skill accepts an argument string with the following forms (all optional):

| Argument | Meaning |
|----------|---------|
| `<path>` (bare) | Target directory. Default: `$PWD`. |
| `--public` / `--private` | Set GitHub repo visibility. If omitted, ask the user (default public). |
| `--name=<name>` | Override the project name (otherwise = directory basename). |

Examples:
- `/nerd4rent:new-project-workflow`
- `/nerd4rent:new-project-workflow ~/src/my-thing`
- `/nerd4rent:new-project-workflow ~/src/my-thing --private`
- `/nerd4rent:new-project-workflow ~/src/scratch-1234 --name=cool-app --public`

Parse leniently — accept arguments in any order. If the resolved directory doesn't exist yet, ask the user whether to create it before continuing.

## Step 1 — Inspect (silent, parallel)

Run these checks in one tool batch. Their results feed into the plan and the skip/run decisions for each step.

| Check | Command | Used for |
|-------|---------|----------|
| Is it a git repo? | `git -C <dir> rev-parse --is-inside-work-tree` | Skip `git init` if yes |
| Does git have commits? | `git -C <dir> rev-list -n 1 HEAD` | Skip initial commit if yes |
| Current branch? | `git -C <dir> symbolic-ref --short HEAD` | Rename to `main` if different |
| README present? | `ls README.md` | Skip scaffold if yes |
| Remote configured? | `git -C <dir> remote get-url origin` | Skip `gh repo create` if yes |
| `gh` authenticated? | `gh auth status` | Flag if not |
| GitHub repo exists? | `gh repo view <name>` | Skip `gh repo create` if yes; surface URL |
| Nerdbrain reachable? | `obsidian` CLI present + vault at `~/obsidian/nerdbrain` | Decide whether to include wiki step |

The Linear-project existence check is deferred to **Step 2** because it requires the team selection to disambiguate.

Once you have the inspection results, evaluate the project name (see next subsection) before building the plan.

### Sanity-check the project name

The basename of `<dir>` is the default project name. It will become the public GitHub repo slug and the Linear project name, so a bad default is expensive.

If the user passed `--name=<name>`, use that — no question.

Otherwise apply a heuristic to the basename:

- **All digits, or 10+ consecutive digits anywhere** (timestamp-looking) → suspicious
- **Generic placeholders**: contains `tmp`, `temp`, `scratch`, `test`, `untitled` as a whole `-`/`_` segment → suspicious
- **Single-char or empty** → suspicious

If suspicious, **ask the user once** before building the plan:

```
The directory name '<basename>' looks like a placeholder.
This will be the public GitHub repo slug. Use this name, or pick a new one?
  1. Use '<basename>' anyway
  2. Use a different name (you type it)
```

If they pick option 2, take the new name and use it everywhere downstream. Do **not** rename the local directory — only the remote repo + Linear project + README title. The local path stays as-is.

## Step 2 — Gather remaining decisions

Ask for whatever is still undecided after parsing flags:

1. **Repo visibility** — only if neither `--public` nor `--private` was supplied. Default: `public`.
2. **Linear team** — always ask. Run the `linear-cli` skill to list teams; user picks one. Why ask: teams vary across users; silent defaults land projects in the wrong workspace.

After the team is chosen, run the **Linear project existence check**: ask `linear-cli` whether a project named `<name>` already exists in `<team>`. If yes, capture its URL — this turns Linear's plan-step into a skip.

If `linear-cli` is not available in the session, skip Linear creation entirely and note in the plan: `Linear step skipped — linear-cli skill not detected`.

## Step 3 — Present the plan, get single approval

Each line shows either `[run]` or `[skip — <reason>]` based on inspection results. Format:

```
Plan for new project: <name>
────────────────────────────────
  Directory:   <absolute-path>
  Visibility:  public | private
  Linear team: <team-name>
  Nerdbrain:   <enabled | disabled — vault not detected>

  1. git init + branch main          [run] | [skip — already a repo on main]
  2. Create README.md                 [run] | [skip — exists, keeping]
  3. Initial commit                   [run] | [skip — repo has commits]
  4. gh repo create <name> --<vis> \
       --source=. --remote=origin \
       --push                         [run] | [skip — exists: <url>]
  5. Linear project '<name>' in <team>
                                      [run] | [skip — exists: <url>]
  6. Nerdbrain wiki entity page      [run] | [skip — disabled]
  7. Pick spec skill from menu

Proceed? [Y/n]
```

If a step is a `[skip]`, also include its existing URL/path on the same line so the user can sanity-check. Anything other than `y`/`Y`/`yes`/empty (default Y) → abort cleanly with "Cancelled. No changes made."

## Step 4 — Execute

Run steps in order. **Skip any step marked `[skip]` in the plan.**

### 4.1 — git init + main branch

```
git init && git branch -M main
```

Defer the initial commit until after the README step.

### 4.2 — README.md

Only create if absent. **Use a title-cased project name** in the heading:

- Split the name on `-`, `_`, and spaces.
- For each segment: capitalize the first letter, leave the rest of the characters untouched (so `MyAPI` stays `MyAPI`, not `Myapi`).
- Join with spaces.

Examples:
- `nerd4rent-repo` → `Nerd4rent Repo`
- `my_cool_project` → `My Cool Project`
- `MyAPI` → `MyAPI`
- `cool-app` → `Cool App`

Minimal scaffold:

```markdown
# <Title-Cased Name>

> One-line description.
```

Don't pad with TODOs or boilerplate the user will just delete.

### 4.3 — Initial commit

```
git add -A && git commit -m "chore: initial commit"
```

Skip if the repo already has commits.

### 4.4 — gh repo create

```
gh repo create <name> --public|--private --source=. --remote=origin --push
```

Failure paths:
- gh not installed → stop with: "Install `gh` (https://cli.github.com) and re-run." Earlier steps remain.
- gh not authenticated → stop with: "Run `gh auth login` and re-run."
- Repo already exists on GitHub but no local remote → don't recreate; instead `git remote add origin <existing-url>` and `git push -u origin main`. Surface the existing URL.

Never use `--force` or `--confirm`-bypassing flags.

### 4.5 — Linear project

Invoke the `linear-cli` skill: create a project named `<name>` in team `<team>`. Capture the project URL. If existence check in Step 2 already found a matching project, skip and reuse that URL.

### 4.6 — Nerdbrain entity page (conditional)

Only run if inspection confirmed nerdbrain is reachable. Create `~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md` using the template in the user's global `CLAUDE.md`, prefilled with:

- `slug: <name>`
- `remote: <github-url>`
- `local-paths: [{host: <hostname>, path: <absolute-path>}]`
- `linear: { team: <team>, project: <linear-uuid> }`
- `created` / `updated`: today

Then append a one-liner to `5-wiki/index.md` under `## Projekty` and a log entry to `5-wiki/log.md`. Use the `obsidian-cli` skill for all vault writes.

If nerdbrain is *not* reachable (this is the common case for users installing the open-source plugin), this whole step is silently skipped — no error.

### 4.7 — Summary

After execution, print a compact summary:

```
Created:
  Directory: <path>
  GitHub:    <url>
  Linear:    <url>
  Wiki:      <vault-path> (or 'disabled')
Now picking spec skill...
```

## Step 5 — Pick a spec-creating skill (dynamic)

Do **not** hardcode the menu. The set of installed skills varies per user and grows over time. Instead:

1. **Scan your currently-available skills.** In each Claude session, available skills are listed in the system context (the `available skills` system reminder). Read that list.

2. **Filter to spec-creating skills.** A spec-creating skill is one whose description matches at least one of these signals:
   - Produces a structured artifact: PRD, SPEC, plan, design doc, ADR, mockup.
   - Drives ideation through questioning: brainstorming, grilling, interviewing, Socratic exploration.
   - Routes a fuzzy idea toward a concrete deliverable.

   Exclude: review skills (CEO/eng/design review), execution skills (implement-task, ship), debugging, and skills that operate on existing artifacts only.

3. **Rank and present.** Show **3–9 skills** as a numbered list. Put the most general-purpose ones first (e.g. brainstorming, grilling), domain-specific ones lower. Format:

   ```
   Pick a spec skill to drive the next step:
     1. /grill-me — interview until shared understanding
     2. /to-prd — turn current context into a PRD
     3. /office-hours — YC forcing questions + design brainstorm
     ...
   Pick [1-N] or 'skip':
   ```

4. **Invoke the chosen skill.** When the user picks a number, invoke that skill via the Skill tool. Do not summarize what it will do — just hand off cleanly. If they pick `skip`, exit with the summary from Step 4.7.

### Why dynamic discovery

A hardcoded list rots within weeks: skills get renamed, new ones appear, the user adds personal favourites. By reading the live skill list, the menu always reflects what's actually installed. The trade-off is a slightly different menu each run — that's fine, the user is picking based on the descriptions, not on muscle memory of "always option 2".

## Failure modes & graceful degradation

| Situation | Behavior |
|-----------|----------|
| Target directory doesn't exist | Ask whether to create it. Don't silently `mkdir`. |
| Basename looks like a placeholder | Ask once for a name override; use the override everywhere remote-facing. |
| `gh` not installed | Stop before step 4.4 with: "Install `gh` (https://cli.github.com) and re-run." Earlier steps remain. |
| `gh` not authenticated | Stop before step 4.4 with: "Run `gh auth login` and re-run." |
| Repo already has remote `origin` | Skip `gh repo create`; use existing remote. |
| GitHub repo with same name exists, no local remote | Wire the existing remote with `git remote add origin <url>` and push. No duplicate created. |
| `linear-cli` skill not in session | Skip Linear creation; continue. |
| Linear project with same name already exists in team | Surface existing URL; do not create duplicate. |
| Nerdbrain vault not reachable | Silently skip step 4.6. This is normal for users without nerdbrain. |
| User aborts at approval gate | Print "Cancelled. No changes made." Step 1 is read-only. |
| No spec-creating skills found in session | Print: "No spec skills detected. Try `/grill-me`, `/to-prd`, or `/office-hours` manually." Exit cleanly. |

## Examples

**Example 1 — fresh directory, full happy path:**

```
User: /nerd4rent:new-project-workflow ~/src/my-side-project --public
Claude: [inspects: empty dir, gh authed, nerdbrain reachable]
        Linear teams:
          1. nerd4rent
          2. open-source
        Team [1]: 1
        [Linear existence check: no match]
        [shows plan with all steps [run]; user hits Y]
        [executes: git init, README "My Side Project", commit, gh, linear, wiki]
        [shows spec skill menu]
        Pick [1-N]: 1
        [hands off to /grill-me]
```

**Example 2 — existing repo with README, GitHub repo also already created:**

```
User: bootstrap this folder as a nerd4rent project
Claude: [inspects: git repo on main with commits, README exists,
         GitHub repo 'mything' exists under user, no local origin]
        Visibility (public/private) [public]: <enter>
        Linear team: nerd4rent
        [Linear existence: project 'mything' already exists → url X]
        Plan:
          1. git init   [skip — already a repo on main]
          2. README     [skip — exists, keeping]
          3. commit     [skip — repo has commits]
          4. gh repo    [skip — exists: github.com/user/mything; will wire remote + push]
          5. linear     [skip — exists: linear.app/.../project/X]
          6. nerdbrain  [run]
          7. spec menu
        Proceed? [Y/n]: y
        [wires remote, pushes; writes wiki entry; shows menu]
```

**Example 3 — placeholder basename triggers name prompt:**

```
User: /nerd4rent:new-project-workflow /tmp/scratch-1747569600
Claude: The directory name 'scratch-1747569600' looks like a placeholder.
        This will be the public GitHub repo slug. Use this name, or pick a new one?
          1. Use 'scratch-1747569600' anyway
          2. Use a different name (you type it)
        Pick: 2
        New name: agent-evals
        [continues with 'agent-evals' as remote name, README title 'Agent Evals',
         Linear project 'agent-evals'; local dir path unchanged]
```

## Conventions to keep

- **English-only in committed files** (README scaffold, commit messages) — tokenization efficiency, matches the user's global guidance for entity pages.
- **Initial commit message**: `chore: initial commit`. Don't editorialize.
- **Default branch**: `main`. Run `git branch -M main` after `git init` to make this explicit.
- **Never `--force` anything.** No `gh repo create --force`, no `git push --force`. This skill must be safe to re-run.
- **Title-case README headings** as defined in 4.2, never the raw slug.
