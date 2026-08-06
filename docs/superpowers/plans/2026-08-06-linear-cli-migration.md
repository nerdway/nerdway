# Linear CLI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite every `linear` invocation in this repo's skills and CLI contract from the retired Node CLI (v2.0.0) to `joa23/linear-cli` (Go, v1.10.0), which the repo already declares as its dependency.

**Architecture:** Pure documentation + config migration. Six markdown skill files and one JSON contract change; no TypeScript is touched. Each skill loses its delegation to the foreign `linear-cli` skill and gains a short, self-contained **CLI reference** section listing exactly the commands it uses. Every command written into a skill is proven against the live CLI before it is committed.

**Tech Stack:** Markdown skill files, JSON contract, Node 24 (native TS stripping) for the existing validator and test suite, `linear` 1.10.0 on PATH.

**Spec:** `docs/superpowers/specs/2026-08-05-linear-cli-migration-design.md`

## Global Constraints

- `linear` means `joa23/linear-cli`, minimum version `1.10.0`. Verify with `linear --version` → `linear version 1.10.0` (or higher) before starting.
- **Never write a command into a skill without proving it first.** Each task has a verification step that runs the new commands against the live CLI. A plausible-looking flag that does not exist is the single most likely failure mode of this migration.
- State names are the team's own **names**, not Linear state types: `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`. Not `backlog`. Confirm with `linear teams states DEMO`.
- Multi-line bodies (descriptions, comments) go through **stdin**. `--body-file` and `--description-file` do not exist.
- Skill files are **English-only**. Commit messages are **Polish, declarative noun form, ASCII without diacritics** (matching existing history: `Dodanie…`, `Poprawa…`, `Przepisanie…`). Never add a co-author trailer or self-attribution.
- **No code comments** (global CLAUDE.md §5). The one pre-existing HTML comment in `issue-template.md` is corrected in place, not removed and not added to.
- **Surgical changes only.** Every changed line must trace to this migration. Do not reformat, reword, or improve adjacent prose.
- Baseline before any change: `node --test scripts/lib/*.test.ts scripts/types/*.test.ts` → **39 pass, 0 fail**; `node scripts/validate-cli-dependencies.ts` → `OK: 4 CLI entries validated`. Both must still hold at the end.
- **The gate has two legitimate exceptions**, discovered while executing Task 2. The migrated text deliberately contains `joa23/linear-cli` (the CLI's identity line) and sentences of the form ``there is no `--body-file` `` — both match the raw pattern while being exactly the text we want. Every gate in this plan therefore filters them out:

  ```bash
  grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' <files> \
    | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
  ```

  Verified: this drops zero real hits — all eight old forms (`linear issue view`, `linear team list`, `linear project list`, `--body-file`, `--description-file`, `--no-interactive`, `branchName`, a bare `linear-cli` skill reference) are still caught. The filter is line-based, so a single line carrying both the identity string and genuine old syntax would slip through; that shape does not occur, since the identity line is fixed boilerplate.
- Work on branch `spec/linear-cli-migration` (already created, spec already committed there).

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `cli-dependencies.json` | Declares required CLIs, version floors, install strategies, auth probes | Fix the `linear` auth probe (`whoami` → `auth status`) |
| `skills/linear-issue-workflow/SKILL.md` | Status-driven plan → implement → review loop for an existing issue | Heaviest rewrite: fetch strategy, status gate, branch naming, comments, list query |
| `skills/linear-issue-close/SKILL.md` | Mechanical close-out (commit, push, merge, set Done) | Issue-ID resolution from branch; set-state command |
| `skills/linear-issue-writer/SKILL.md` | Creates a new, well-specified issue in Backlog | Create/update via stdin; team+project discovery; priority naming |
| `skills/linear-issue-writer/issue-template.md` | Issue body templates | One command name inside an existing HTML comment |
| `skills/new-project-workflow/SKILL.md` | End-to-end new-project bootstrap incl. Linear project | Pluralised commands, UUID read-back, loss of project URL, availability probe |
| `skills/nerdbrain-wiki/SKILL.md` | How to write a nerdbrain entity page | Two commands used to resolve `linear.team` / `linear.project` |
| `skills/nerdbrain-wiki/entity-page-template.md` | Entity-page scaffold | Same two commands, in frontmatter hints |

Task order follows dependency of understanding, not of code: the contract fix comes first (it is what makes `bootstrap-clis` stop lying), then the three Linear skills in decreasing depth of change, then the two consumers.

---

### Task 1: Fix the `linear` auth probe in the CLI contract

`bootstrap-clis` probes authentication with `linear whoami`. That command does not exist in the Go CLI, so a correctly authenticated machine is reported as unauthenticated.

**Files:**
- Modify: `cli-dependencies.json:38-41`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on. Independent.

- [ ] **Step 1: Prove the bug**

```bash
linear whoami
```

Expected: `Error: unknown command "whoami" for "linear"`, non-zero exit.

- [ ] **Step 2: Prove the replacement works**

```bash
linear auth status; echo "exit: $?"
```

Expected: `✅ Logged in to Linear`, followed by user/ID/mode lines, and `exit: 0`.

- [ ] **Step 3: Apply the change**

In `cli-dependencies.json`, inside the entry with `"id": "linear"`, replace:

```json
        "check": ["linear", "whoami"],
```

with:

```json
        "check": ["linear", "auth", "status"],
```

Leave `minVersion`, `versionCommand`, `versionRegex`, `releaseBase`, `checksums`, `install`, and `auth.instructions` untouched — they already point at `joa23/linear-cli` v1.10.0.

- [ ] **Step 4: Validate the contract**

```bash
node scripts/validate-cli-dependencies.ts
```

Expected: `OK: 4 CLI entries validated`, exit 0.

- [ ] **Step 5: Confirm no `whoami` remains**

```bash
grep -rn 'whoami' skills/ cli-dependencies.json
```

Expected: no output, exit 1.

- [ ] **Step 6: Commit**

```bash
git add cli-dependencies.json
git commit -m "Poprawa sprawdzenia autoryzacji linear na auth status"
```

---

### Task 2: Rewrite `linear-issue-workflow`

The workflow skill carries the most commands and the two structural changes: `export` for context, `get -f minimal` for the per-turn status gate.

**Files:**
- Modify: `skills/linear-issue-workflow/SKILL.md` (lines 10, 15, 36, 50-51, 136-139, 160-161, 171-172, 234-236, 250-252, 258)

**Interfaces:**
- Consumes: the corrected auth probe from Task 1 only in spirit; no textual dependency.
- Produces: the **CLI reference** section format that Tasks 3 and 4 mirror — a `## CLI reference` heading placed immediately after the H1 intro paragraph, holding a purpose→command table plus a short paragraph of gotchas.

- [ ] **Step 1: Prove the old syntax is present**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/linear-issue-workflow/SKILL.md
```

Expected: hits on lines **10, 15, 36, 50, 51, 137, 138, 161, 171, 235, 251, 258** — twelve lines. Line 171 is easy to miss: it names `linear issue pr`, a command the Go CLI does not have at all.

- [ ] **Step 2: Prove every replacement command against the live CLI**

Run each and confirm the described output. Substitute a real issue ID from your workspace for `DEMO-237`.

```bash
linear issues get DEMO-237 -f minimal -o json
linear issues slug DEMO-237
linear issues export DEMO-237 "${TMPDIR:-/tmp}/linear-DEMO-237" && head -12 "${TMPDIR:-/tmp}/linear-DEMO-237/DEMO-237.md"
linear issues list --team DEMO --state 'Todo,In Progress,In Review' --limit 3
linear teams states DEMO
```

Expected:
- `get -f minimal -o json` → exactly `{"identifier": …, "title": …, "state": …}`.
- `slug` → a bare lowercase string like `demo-237_dodac_skrypt_wspierajacy_deployment`.
- `export` → `Exported DEMO-237 -> …/DEMO-237.md (N comments, M assets)`, and the head of the file shows a `| Field | Value |` table containing `State`, `Project`, `URL`, followed by `## Description`.
- `issues list` → compact issue lines, no error about an unknown state.
- `teams states DEMO` → includes `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`.

Do **not** proceed if any command errors. Fix the plan, not the skill.

- [ ] **Step 3: Update the frontmatter**

Replace (line 10):

```
  Invoke this skill FIRST; use linear-cli for CLI syntax.
```

with:

```
  Invoke this skill FIRST; the linear commands it needs are in its CLI reference.
```

- [ ] **Step 4: Replace the delegation line with a CLI reference section**

Replace (line 15, the single line under the `# Linear issue workflow` heading):

```
Use with the `linear-cli` skill for every `linear` command (flags, subcommands).
```

with:

````
## CLI reference

`linear` is `joa23/linear-cli` (Go). These are the only commands this skill needs:

| Purpose | Command |
|---------|---------|
| Status gate (every turn) | `linear issues get <ID> -f minimal -o json` |
| Full context (entering a phase) | `linear issues export <ID> "${TMPDIR:-/tmp}/linear-<ID>"` |
| Post a comment | `cat body.md \| linear issues comment <ID>` |
| Set status | `linear issues update <ID> --state 'In Progress'` |
| Branch name | `linear issues slug <ID>` |
| Active work in a team/project | `linear issues list --team <KEY> --project <name> --state 'Todo,In Progress,In Review'` |

`get -f minimal -o json` returns exactly `identifier`, `title`, `state` — cheap
enough to run every turn. `export` writes `<ID>.md` (state table, full
description, every comment, a `References` section with linked PRs) plus an
`assets/` folder holding inline images as local files ready to `Read`.

States are the team's own **names** — `Backlog`, not `backlog`; list them with
`linear teams states <KEY>`. Multi-line bodies always arrive on **stdin**; there
is no `--body-file`.
````

- [ ] **Step 5: Update the per-turn status gate**

In hard gate 2, replace:

```
2. **Status check every turn**: at the start of every turn that touches the
   issue, run `linear issue view <ID> -j` and dispatch on the current status.
   The status may have changed since the last message.
```

with:

```
2. **Status check every turn**: at the start of every turn that touches the
   issue, run `linear issues get <ID> -f minimal -o json` and dispatch on the
   current status. The status may have changed since the last message.
```

- [ ] **Step 6: Update the fetch step in Dispatch by status**

Replace:

```
Fetch first — `linear issue view <ID> -j` — read title, description, state,
`branchName`, and **all comments**. Then:
```

with:

```
Fetch first — `linear issues export <ID> "${TMPDIR:-/tmp}/linear-<ID>"` — then
`Read` the produced `<ID>.md`. That one file carries the state table, the full
description, every comment, and a `References` section listing linked PRs;
inline images land in `assets/` as local files. Export into the temp directory,
never into the repo. Then:
```

- [ ] **Step 7: Update the plan-posting commands**

Replace:

```bash
linear issue comment add <ID> --body-file <path-to-plan.md>
linear issue update <ID> -s Todo
```

with:

```bash
cat <path-to-plan.md> | linear issues comment <ID>
linear issues update <ID> --state Todo
```

- [ ] **Step 8: Update branch creation**

Replace:

```
   - On `main`/`master`: `git checkout -b <branchName from issue view -j>`.
```

with:

```
   - On `main`/`master`: `git checkout -b "$(linear issues slug <ID>)"`.
```

- [ ] **Step 9: Drop the reference to `linear issue pr`**

The parenthetical steers the reader away from a command that no longer exists,
so it now points at nothing. Replace:

```
3. **Draft PR with Linear magic words** — use `gh` (not `linear issue pr`,
   which does not put magic words in the body):
```

with:

```
3. **Draft PR with Linear magic words** — use `gh`; the Linear CLI has no
   PR-opening command:
```

Leave the `gh pr create` block that follows untouched.

- [ ] **Step 10: Update the session-summary command**

Replace:

```bash
linear issue comment add <ID> --body-file <summary.md>
```

with:

```bash
cat <summary.md> | linear issues comment <ID>
```

- [ ] **Step 11: Update the nerdbrain integration query**

Replace:

```
- When the injected entity page's frontmatter has `linear.team` or
  `linear.project`, query Linear for active work (`linear issue query
  --team <key>` / `--project <name>`) instead of re-asking the user.
```

with:

```
- When the injected entity page's frontmatter has `linear.team` or
  `linear.project`, query Linear for active work (`linear issues list
  --team <key> --project <name> --state 'Todo,In Progress,In Review'`)
  instead of re-asking the user.
```

- [ ] **Step 12: Drop `linear-cli` from Related skills**

Delete this whole line from the `## Related skills` list:

```
- `linear-cli` — CLI reference (always before `linear` commands).
```

Leave the remaining bullets untouched.

- [ ] **Step 13: Verify the file is clean**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/linear-issue-workflow/SKILL.md \
  | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
```

Expected: no output. The filter is required: the CLI reference you added in step 4 legitimately contains `joa23/linear-cli` and the sentence ``there is no `--body-file` ``, both of which match the raw pattern.

- [ ] **Step 14: Commit**

```bash
git add skills/linear-issue-workflow/SKILL.md
git commit -m "Przepisanie linear-issue-workflow na skladnie joa23/linear-cli"
```

---

### Task 3: Rewrite `linear-issue-close`

The close-out skill loses `linear issue id`, which had no replacement command — the issue ID must be parsed from the branch name locally.

**Files:**
- Modify: `skills/linear-issue-close/SKILL.md` (frontmatter line 12; lines 22, 29-31, 131, 146)

**Interfaces:**
- Consumes: the `## CLI reference` section shape produced by Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Prove the old syntax is present**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/linear-issue-close/SKILL.md
```

Expected: hits on lines **12, 22, 30, 131, 146**.

- [ ] **Step 2: Prove the replacements**

```bash
linear issues update --help | grep -- '--state'
echo 'demo-237_dodac_skrypt_wspierajacy_deployment' | grep -oiE '[a-z]+-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]'
```

Expected:
- the `--state` flag exists on `issues update` with description `Update workflow state name (e.g., 'In Progress', 'Backlog')`;
- the pipeline prints exactly `DEMO-237`.

Do not run `linear issues update` against a real issue — it would mutate the workspace.

- [ ] **Step 3: Update the frontmatter**

Replace (line 12):

```
  out", "merge and close"). Use linear-cli for the Linear command.
```

with:

```
  out", "merge and close"). The Linear command is in the CLI reference.
```

- [ ] **Step 4: Replace the delegation line with a CLI reference section**

Replace:

```
Use the `linear-cli` skill for the `linear` command syntax.
```

with:

````
## CLI reference

`linear` is `joa23/linear-cli` (Go). This skill issues exactly one write:

```bash
linear issues update <ID> --state Done
```

`Done` is the team's own state **name**, not a state type — list a team's names
with `linear teams states <KEY>`. There is no command mapping a branch back to
an issue, so the ID is resolved locally, below.
````

- [ ] **Step 5: Replace the issue-ID resolution**

Replace:

```bash
linear issue id
```

with:

```bash
git branch --show-current | grep -oiE '[a-z]+-[0-9]+' | head -1 | tr '[:lower:]' '[:upper:]'
```

and immediately after the code block, before the `Call it `<ID>` below.` line, insert:

```
Matching is case-insensitive because `linear issues slug` produces lowercase
branch names; the result is upper-cased because Linear expects `DEMO-123`. **If
nothing matches, stop and ask the user for the ID** — never guess it.
```

- [ ] **Step 6: Update the set-Done command**

Replace:

```bash
linear issue update <ID> -s Done
```

with:

```bash
linear issues update <ID> --state Done
```

- [ ] **Step 7: Drop `linear-cli` from Related skills**

Delete this whole line:

```
- `linear-cli` — CLI reference for the `linear` command.
```

- [ ] **Step 8: Verify the file is clean**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/linear-issue-close/SKILL.md \
  | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
```

Expected: no output. The filter is required: the CLI reference you added in step 4 names `joa23/linear-cli`, which matches the raw pattern legitimately.

- [ ] **Step 9: Commit**

```bash
git add skills/linear-issue-close/SKILL.md
git commit -m "Przepisanie linear-issue-close na skladnie joa23/linear-cli"
```

---

### Task 4: Rewrite `linear-issue-writer` and its template

Creation moves to positional title + stdin description. `--no-interactive` disappears, `linear issue url` disappears, and the priority scale changes meaning.

**Files:**
- Modify: `skills/linear-issue-writer/SKILL.md` (lines 12, 20, 69-72, 122-125, 130-136, 138-140, 149-150, 159, 171)
- Modify: `skills/linear-issue-writer/issue-template.md:90`

**Interfaces:**
- Consumes: the `## CLI reference` section shape produced by Task 2.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Prove the old syntax is present**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/linear-issue-writer/SKILL.md skills/linear-issue-writer/issue-template.md
```

Expected: hits on `SKILL.md` lines **12, 20, 70, 71, 72, 123, 124, 131, 132, 134, 135, 150, 159, 171** and `issue-template.md` line **90**.

Lines 71-72 hold `linear team list` and `linear project list` — a narrower pattern that only looked for `linear issue ` would silently leave them behind.

- [ ] **Step 2: Prove the replacements**

```bash
linear teams list
linear projects list --team DEMO
linear issues list --team DEMO --limit 1
linear issues create --help | grep -E '^\s+(-o|-p|-P|-t|-s|--parent|-d)'
```

Expected:
- `teams list` and `projects list` return data;
- `issues create --help` shows `-d/--description` documented as *"(or pipe to stdin)"*, `-o/--output` with a `json` value, `-p/--priority` accepting `0-4 or none/urgent/high/normal/low`, plus `--parent`, `-t/--team`, `-P/--project`, `-s/--state`;
- there is **no** `--no-interactive` and **no** `--description-file` in the output.

Do **not** run `linear issues create` — it would leave a junk issue the CLI cannot delete.

- [ ] **Step 3: Update the frontmatter**

Replace (line 12):

```
  Use linear-cli for CLI syntax.
```

with:

```
  The CLI reference lives in the skill body.
```

- [ ] **Step 4: Replace the delegation line with a CLI reference section**

Replace:

```
Use with the `linear-cli` skill for every `linear` command (flags, subcommands).
```

with:

````
## CLI reference

`linear` is `joa23/linear-cli` (Go). Commands this skill uses:

| Purpose | Command |
|---------|---------|
| List teams | `linear teams list` |
| List a team's projects | `linear projects list --team <KEY>` |
| Sanity-check a team key | `linear issues list --team <KEY> --limit 1` |
| Create an issue | `cat body.md \| linear issues create "<title>" --team <KEY> --project "<name>" --state Backlog -o json` |
| Create a sub-issue | the same, plus `--parent <PARENT-ID>` |
| Replace a description | `cat body.md \| linear issues update <ID>` |

The description always arrives on **stdin** — there is no `--description-file`.
`-o json` returns the created issue including `.identifier` and `.url`, which is
the only way to get an issue URL; there is no separate URL command. The CLI is
never interactive, so there is no `--no-interactive` flag. States are the team's
own **names** (`linear teams states <KEY>`) — `Backlog`, not `backlog`.
````

- [ ] **Step 5: Update team/project discovery**

Replace:

```
2. **Git remote inference** — map the repo to a Linear team/project (e.g. via
   `linear issue query --team <key>` to sanity-check the key exists).
3. **Ask** — if still unknown, list options (`linear team list`,
   `linear project list`) and ask which team/project.
```

with:

```
2. **Git remote inference** — map the repo to a Linear team/project (e.g. via
   `linear issues list --team <key> --limit 1` to sanity-check the key exists).
3. **Ask** — if still unknown, list options (`linear teams list`,
   `linear projects list --team <key>`) and ask which team/project.
```

- [ ] **Step 6: Update the single-issue create command**

Replace:

```bash
linear issue create --team <key> --project <name> \
  -t "<title>" --description-file <path> -s backlog --no-interactive
```

with:

```bash
cat <path> | linear issues create "<title>" \
  --team <key> --project "<name>" --state Backlog -o json
```

- [ ] **Step 7: Update the parent + sub-issue create commands**

Replace:

```bash
linear issue create --team <key> --project <name> \
  -t "<parent title>" --description-file <parent.md> -s backlog --no-interactive
# → note the new ID, e.g. DEMO-123
linear issue create --team <key> --project <name> \
  -t "<child title>" --description-file <child-1.md> --parent DEMO-123 -s backlog --no-interactive
```

with:

```bash
cat <parent.md> | linear issues create "<parent title>" \
  --team <key> --project "<name>" --state Backlog -o json
# → read .identifier from the JSON, e.g. DEMO-123
cat <child-1.md> | linear issues create "<child title>" \
  --team <key> --project "<name>" --parent DEMO-123 --state Backlog -o json
```

- [ ] **Step 8: Update the metadata paragraph**

Replace:

```
Add `-l/--label`, `-p/--priority`, `--estimate`, etc. only when the user specified
them — don't invent metadata. (`linear` CLI supports `--parent`; no need for
`issue relation` for parent/child.)
```

with:

```
Add `-l/--labels`, `-p/--priority`, `-e/--estimate`, etc. only when the user
specified them — don't invent metadata. Priority takes a **name**
(`urgent|high|normal|low`, or `none`); prefer the name over the numeric 0–4
scale, whose meaning differs from the CLI this skill used previously.
`--parent` handles parent/child directly.
```

- [ ] **Step 9: Update the description-update command**

Replace:

```
- sharpened requirements → update the issue description
  (`linear issue update <ID> --description-file <path>`) after showing the diff;
```

with:

```
- sharpened requirements → update the issue description
  (`cat <path> | linear issues update <ID>`) after showing the diff;
```

- [ ] **Step 10: Update the output/handoff step**

Replace:

```
Print the created issue ID(s) and URL(s) (`linear issue url <ID>`). Then point at
```

with:

```
Print the created issue ID(s) and URL(s) — both come from step 5's `-o json`
output (`.identifier` and `.url`); there is no URL command. Then point at
```

- [ ] **Step 11: Drop `linear-cli` from Related skills**

Delete this whole line:

```
- `linear-cli` — CLI reference (always before `linear` commands).
```

- [ ] **Step 12: Fix the command name in the template**

In `skills/linear-issue-writer/issue-template.md`, replace:

```
<!-- Parent is linked via `linear issue create --parent <PARENT-ID>`, not in the body. -->
```

with:

```
<!-- Parent is linked via `linear issues create --parent <PARENT-ID>`, not in the body. -->
```

This corrects an existing comment in place. Do not remove it and do not add any other comment.

- [ ] **Step 13: Verify both files are clean**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/linear-issue-writer/SKILL.md skills/linear-issue-writer/issue-template.md \
  | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
```

Expected: no output. The filter is required here for three legitimate mentions the CLI reference in step 4 introduces: `joa23/linear-cli`, ``there is no `--description-file` ``, and ``there is no `--no-interactive` flag``.

- [ ] **Step 14: Commit**

```bash
git add skills/linear-issue-writer/SKILL.md skills/linear-issue-writer/issue-template.md
git commit -m "Przepisanie linear-issue-writer na skladnie joa23/linear-cli"
```

---

### Task 5: Rewrite the Linear steps in `new-project-workflow`

Three changes beyond renaming: the availability probe stops asking about a skill and starts asking about the CLI; the project UUID needs a read-back call; and the project URL is dropped everywhere because the CLI does not expose it.

**Files:**
- Modify: `skills/new-project-workflow/SKILL.md` (lines 85, 87, 89, 110, 117, 178, 189-192, 207, 253, 254, 286, 292)

**Interfaces:**
- Consumes: nothing textual from earlier tasks.
- Produces: the `linear: { team, project: <uuid> }` frontmatter contract that Task 6's template documents — the UUID comes from `linear projects list --team <KEY> -o json`, field `.id`.

- [ ] **Step 1: Prove the old syntax is present**

Two greps, because this file mixes Linear references with GitHub ones that must survive.

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/new-project-workflow/SKILL.md
```

Expected: hits on lines **85, 87, 89, 178, 189, 192, 253** — all of which go away.

```bash
grep -nE 'exists: <url>|Linear:    <url>|existing URL|url X|linear\.app/\.\.\./project|URL/path' skills/new-project-workflow/SKILL.md
```

Expected: hits on lines **108, 110, 117, 172, 207, 254, 286, 292**. Of these,
**108 and 172 are the GitHub repo's URL and must stay untouched**; the other six
are Linear's and change in the steps below.

- [ ] **Step 2: Prove the replacements, including the URL gap**

```bash
linear teams list
linear projects list --team DEMO -o json | head -12
linear projects create --help | grep -c -- '--output'
```

Expected:
- `projects list -o json` returns objects with `id`, `name`, `description`, `state`, `content`, `issues` — **and no `url` field**;
- `projects create --help | grep -c -- '--output'` prints `0`, confirming create cannot emit JSON.

This is the evidence behind dropping the URL. If `--output` ever appears on `projects create`, stop and revise the spec instead of implementing this task.

- [ ] **Step 3: Update the team-listing instruction**

Replace:

```
2. **Linear team** — always ask. Run the `linear-cli` skill to list teams; user picks one. Why ask: teams vary across users; silent defaults land projects in the wrong workspace.
```

with:

```
2. **Linear team** — always ask. Run `linear teams list`; user picks one. Why ask: teams vary across users; silent defaults land projects in the wrong workspace.
```

- [ ] **Step 4: Update the project existence check**

Replace:

```
After the team is chosen, run the **Linear project existence check**: ask `linear-cli` whether a project named `<name>` already exists in `<team>`. If yes, capture its URL — this turns Linear's plan-step into a skip.
```

with:

```
After the team is chosen, run the **Linear project existence check**: `linear projects list --team <team> -o json`, and look for an entry whose `name` equals `<name>`. If found, capture its `id` (UUID) — this turns Linear's plan-step into a skip. The CLI exposes no project URL, so the UUID is what gets surfaced.
```

- [ ] **Step 5: Update the availability probe**

Replace:

```
If `linear-cli` is not available in the session, skip Linear creation entirely and note in the plan: `Linear step skipped — linear-cli skill not detected`.
```

with:

```
If `linear` is missing from PATH or `linear auth status` exits non-zero, skip Linear creation entirely and note in the plan: `Linear step skipped — linear CLI unavailable or not authenticated`.
```

- [ ] **Step 6: Update the plan preview and its caption**

Inside the fenced plan block, replace:

```
  5. Linear project '<name>' in <team>
                                      [run] | [skip — exists: <url>]
```

with:

```
  5. Linear project '<name>' in <team>
                                      [run] | [skip — exists: <uuid>]
```

Leave line 108 (`--push [run] | [skip — exists: <url>]`) alone — that is the GitHub step, which still has a URL.

Then replace:

```
If a step is a `[skip]`, also include its existing URL/path on the same line so the user can sanity-check.
```

with:

```
If a step is a `[skip]`, also include its existing URL/path/UUID on the same line so the user can sanity-check.
```

- [ ] **Step 7: Rewrite step 4.5**

Replace the whole paragraph:

```
Invoke the `linear-cli` skill: create a project named `<name>` in team `<team>` with `-j` and capture the project URL **and the project UUID** (`id`) from the JSON output — step 4.6 needs the UUID for the entity-page frontmatter. If existence check in Step 2 already found a matching project, skip creation and resolve the existing project's URL + UUID via `linear project list --team <team> -j`.
```

with:

````
Create the project, then read its UUID back — `projects create` takes no
`--output` flag and prints nothing parseable, so the UUID needs a second call:

```bash
linear projects create "<name>" --team <team> -d "<one-line description>"
linear projects list --team <team> -o json
```

From the second command's output, take the `.id` of the entry whose `name`
equals `<name>`. Step 4.6 needs that UUID for the entity-page frontmatter. If
the existence check in Step 2 already found a matching project, skip creation
and reuse the UUID it captured.

The CLI exposes no project URL in any command or output format — do not attempt
to construct one.
````

- [ ] **Step 8: Update the 4.6 fallback wording**

Replace:

```
  found there, so the UUID is known). If step 4.5 was skipped (no `linear-cli`
  in session), omit the `linear:` block — Linear was not checked, and
  `linear: none` means a confirmed "no Linear counterpart exists"; backfill
  in a later session with `linear-cli` available.
```

with:

```
  found there, so the UUID is known). If step 4.5 was skipped (no working
  `linear` CLI), omit the `linear:` block — Linear was not checked, and
  `linear: none` means a confirmed "no Linear counterpart exists"; backfill
  in a later session with the CLI available.
```

- [ ] **Step 9: Update the summary block**

Inside the fenced summary block, replace:

```
  Linear:    <url>
```

with:

```
  Linear:    <team>/<name> (<uuid>)
```

- [ ] **Step 10: Update the failure-mode table**

Replace:

```
| `linear-cli` skill not in session | Skip Linear creation; continue. |
| Linear project with same name already exists in team | Surface existing URL; do not create duplicate. |
```

with:

```
| `linear` CLI missing or not authenticated | Skip Linear creation; continue. |
| Linear project with same name already exists in team | Surface existing UUID; do not create duplicate. |
```

- [ ] **Step 11: Update example 2**

Replace:

```
        [Linear existence: project 'mything' already exists → url X]
```

with:

```
        [Linear existence: project 'mything' already exists → uuid X]
```

and replace:

```
          5. linear     [skip — exists: linear.app/.../project/X]
```

with:

```
          5. linear     [skip — exists: uuid b705df47-ca9b-…]
```

- [ ] **Step 12: Verify the file is clean**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/new-project-workflow/SKILL.md \
  | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
```

Expected: no output.

Then confirm the GitHub URLs survived and only the Linear ones went:

```bash
grep -nE 'exists: <url>|existing URL' skills/new-project-workflow/SKILL.md
```

Expected: exactly two hits — line 108 (`--push … [skip — exists: <url>]`) and
line 172 (`Surface the existing URL.`), both about the GitHub repo. Any hit on
the Linear plan line, the summary, or the failure table means a step was missed.

- [ ] **Step 13: Commit**

```bash
git add skills/new-project-workflow/SKILL.md
git commit -m "Przepisanie krokow Linear w new-project-workflow na nowe CLI"
```

---

### Task 6: Update `nerdbrain-wiki` and its entity-page template

Two commands, in two files, used to resolve the required `linear.team` and `linear.project` frontmatter fields.

**Files:**
- Modify: `skills/nerdbrain-wiki/SKILL.md:152-154`
- Modify: `skills/nerdbrain-wiki/entity-page-template.md:12-13`

**Interfaces:**
- Consumes: the UUID source established in Task 5 — `linear projects list --team <KEY> -o json`, field `.id`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Prove the old syntax is present**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/nerdbrain-wiki/SKILL.md skills/nerdbrain-wiki/entity-page-template.md
```

Expected: hits on `SKILL.md` lines **152, 153** and `entity-page-template.md` lines **12, 13**.

- [ ] **Step 2: Prove the replacements return what the frontmatter needs**

```bash
linear teams list
linear projects list --team DEMO -o json | grep -m1 '"id"'
```

Expected: a team key such as `DEMO` in the first output, and an `"id": "<uuid>"` line in the second — that UUID is exactly what `linear.project` stores.

- [ ] **Step 3: Update the resolution instruction**

In `skills/nerdbrain-wiki/SKILL.md`, replace:

```
- If unknown, resolve via the `linear-cli` skill: `linear team list` for the
  team key, `linear project list --team <key> -j` for the project **UUID**
  (the `id` field; use the UUID, not the name — stable across renames).
```

with:

```
- If unknown, resolve with the `linear` CLI: `linear teams list` for the team
  key, `linear projects list --team <key> -o json` for the project **UUID**
  (the `id` field; use the UUID, not the name — stable across renames).
```

- [ ] **Step 4: Update the template's frontmatter hints**

In `skills/nerdbrain-wiki/entity-page-template.md`, replace:

```
  team: <team-key>   # from `linear team list` (e.g. DEMO)
  project: <uuid>    # `id` from `linear project list --team <key> -j`
```

with:

```
  team: <team-key>   # from `linear teams list` (e.g. DEMO)
  project: <uuid>    # `id` from `linear projects list --team <key> -o json`
```

These are pre-existing YAML comments carrying the template's field hints — corrected in place, not added.

- [ ] **Step 5: Verify both files are clean**

```bash
grep -nE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName' skills/nerdbrain-wiki/SKILL.md skills/nerdbrain-wiki/entity-page-template.md \
  | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
```

Expected: no output. These two files gain no CLI reference block, so the filter should have nothing to drop here — it is applied only to keep every gate in this plan identical.

- [ ] **Step 6: Commit**

```bash
git add skills/nerdbrain-wiki/SKILL.md skills/nerdbrain-wiki/entity-page-template.md
git commit -m "Przepisanie komend linear w nerdbrain-wiki na nowe CLI"
```

---

### Task 7: Repo-wide gate, version bump, and upstream issue draft

**Files:**
- Modify: `.claude-plugin/plugin.json:3`

**Interfaces:**
- Consumes: all six files from Tasks 1-6 in their migrated state.
- Produces: the final deliverable.

- [ ] **Step 1: Run the repo-wide grep gate**

```bash
grep -rnE 'linear (issue|team|project) |--body-file|--description-file|--no-interactive|whoami|branchName' skills/ cli-dependencies.json \
  | grep -vE 'joa23/linear-cli|is no `--(body-file|description-file|no-interactive)`'
```

Expected: no output.

This is the same pattern each task verified against its own files, plus `whoami` for the contract, and the same two-exception filter (see Global Constraints). The alternation deliberately requires a space after `issue`/`team`/`project`, so the new plural forms (`linear issues get`, `linear teams list`) do not match.

```bash
grep -rn 'linear-cli' skills/
```

Expected: no output, exit 1.

Note this second grep is scoped to `skills/` only — `cli-dependencies.json` legitimately contains `linear-cli` inside the `releaseBase` GitHub URL `https://github.com/joa23/linear-cli/releases/download/v{version}`, which must stay.

- [ ] **Step 2: Re-run the contract validator and the test suite**

```bash
node scripts/validate-cli-dependencies.ts
node --test scripts/lib/*.test.ts scripts/types/*.test.ts
```

Expected: `OK: 4 CLI entries validated`; then `pass 39`, `fail 0` — identical to the pre-change baseline, since no TypeScript was touched.

- [ ] **Step 3: Bump the plugin version**

In `.claude-plugin/plugin.json`, replace:

```json
  "version": "0.9.0",
```

with:

```json
  "version": "0.10.0",
```

Minor bump, not patch: the skills' documented commands changed and `new-project-workflow` no longer reports a Linear project URL — a visible behavior change for anyone already using the plugin.

- [ ] **Step 4: Mark the spec implemented**

In `docs/superpowers/specs/2026-08-05-linear-cli-migration-design.md`, replace:

```
Status: draft
```

with:

```
Status: implemented
```

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json docs/superpowers/specs/2026-08-05-linear-cli-migration-design.md
git commit -m "Podniesienie wersji pluginu do 0.10.0 po migracji na joa23/linear-cli"
```

- [ ] **Step 6: Hand the user the upstream issue draft**

Do **not** file this — `joa23/linear-cli` is a third-party repo. Print the draft in the final report for the user to paste themselves:

```markdown
**Title:** Expose project `url` (or `slugId`) in `projects` output

**Body:**

`projects list`, `projects get`, and `projects create` currently expose no way to
reach a project's Linear URL.

- `projects list -o json` / `projects get -o json` return `id`, `name`,
  `description`, `state`, `content`, `issues` — no `url`, no `slugId`.
- The text output of both omits it too.
- `projects create` has no `--output` flag at all, so a freshly created project
  cannot be reported back to the user with a link.

The URL is not derivable from `id`. For project `nix-wp-env`:

    id:              9c3d7746-1619-4ea2-9638-1ea9bfb9816f
    URL:             https://linear.app/example/project/nix-wp-env-c09c88374de5/overview
    suffix in URL:   c09c88374de5

The suffix does not appear anywhere in the UUID — it is Linear's separate
`Project.slugId`.

Linear's GraphQL API exposes both `Project.url` and `Project.slugId`. Surfacing
either in the `projects` commands (and adding `--output json` to
`projects create`) would let automation link users to what it just created.

Issues are unaffected — `issues get -o json` already returns `url`.

Version: linear 1.10.0
```

- [ ] **Step 7: Push the branch and open a draft PR**

```bash
git push -u origin spec/linear-cli-migration
gh pr create --draft --title "Migracja skilli na joa23/linear-cli" --body "$(cat <<'EOF'
Rewrites every `linear` invocation in the skills and the CLI contract from the
retired Node CLI v2.0.0 to joa23/linear-cli 1.10.0, which
`cli-dependencies.json` already declares.

Spec: `docs/superpowers/specs/2026-08-05-linear-cli-migration-design.md`
Plan: `docs/superpowers/plans/2026-08-06-linear-cli-migration.md`

Behavior change worth flagging: `new-project-workflow` no longer reports a
Linear project URL, because the CLI exposes none and it is not derivable from
the project UUID. It reports `<team>/<name> (<uuid>)` instead.

Also fixes the `linear` auth probe in `cli-dependencies.json` (`whoami` →
`auth status`), which made `bootstrap-clis` report a false authentication
failure.
EOF
)"
```

---

## Self-Review

**Spec coverage** — every section of the spec maps to a task:

| Spec section | Task |
|---|---|
| Tabela tłumaczenia | 2, 3, 4, 5, 6 (each command lands in the file that uses it) |
| Zmiany semantyki argumentów (stany, priorytety, stdin, `--no-interactive`) | 2 (states), 4 (priorities, stdin, no-interactive) |
| Wyjście `linear issues export` | 2, steps 2 and 6 |
| Brak URL-a projektu | 5, steps 2, 4, 6, 7, 9, 10, 11 |
| Składnia inline zamiast delegacji | 2, 3, 4 (CLI reference sections); 5, 6 (plain command references) |
| Podział ról `export` / `get -f minimal` | 2, steps 5 and 6 |
| Nazwa brancha z `issues slug` | 2, step 8 |
| ID issue z nazwy brancha | 3, step 5 |
| UUID projektu przez ponowne odpytanie | 5, step 7 |
| Wykrywanie dostępności przez CLI | 5, step 5 |
| `cli-dependencies.json` auth check | 1 |
| Weryfikacja (validator, testy, grep, smoke) | 1 step 4, 7 steps 1-2, plus per-task step 1/step 2 pairs |
| Poza kodem — zgłoszenie upstream | 7, step 6 |

**Placeholder scan** — no `TBD`, no "add error handling", no "similar to Task N". Every replacement shows both the exact old text and the exact new text.

**Consistency check** — every task's before/after grep uses one canonical pattern, `linear (issue|team|project) |--body-file|--description-file|--no-interactive|linear-cli|branchName`, so no task can pass its own gate while leaving something for Task 7 to find. The expected line numbers in each task's step 1 were produced by running that pattern against the working tree at commit `f35c777`, not estimated. The state string `'Todo,In Progress,In Review'` is identical in Task 2 step 2, step 4, and step 11. `linear projects list --team <KEY> -o json` → `.id` is identical in Tasks 5 and 6. The `## CLI reference` heading is identical across Tasks 2, 3, 4. The temp-dir form `"${TMPDIR:-/tmp}/linear-<ID>"` is identical in Task 2 steps 2, 4, and 6.

**Known plan-time assumption** — line numbers in the **Files** blocks reflect the files as of commit `f35c777`. If an earlier task shifts line numbers within the *same* file, the anchors are the quoted old text, not the numbers; the numbers are navigation aids only. No two tasks modify the same file.
