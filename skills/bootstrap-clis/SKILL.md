---
name: bootstrap-clis
description: >-
  Install only the CLIs the user picks, or the one CLI another skill is missing.
  Default /bootstrap-clis lists the tools in cli-dependencies.json and uses a
  multi-select; a skill that needs a missing tracker or VCS CLI suggests that
  one tool and asks yes/no. Use for `/bootstrap-clis` / `/nerd4rent:bootstrap-clis`,
  when a command like `gh` or `linearis` is missing, or when a power user wants
  a full reconcile with `--all`.
---

# Bootstrap CLIs

`cli-dependencies.json` at the repo root declares which CLIs the skills here
require. `scripts/bootstrap-clis.ts` probes and installs a subset. Mapping is
the inverse of each entry's `requiredBy` (no separate manifesto).

This skill is typically invoked from a project that is not this repo, so the
script cannot be found relative to the current working directory. Instead,
resolve it relative to this skill's own base directory, which you are told
when this skill is invoked. This file lives at
`<skill base directory>/SKILL.md`, i.e. `<plugin root>/skills/bootstrap-clis/`;
go two directories up from the skill base directory to reach the plugin
root, then into `scripts/`, to get the absolute path
`<plugin root>/scripts/bootstrap-clis.ts`. Use that absolute path - not the
bare relative one - in every command below. The same root holds
`cli-dependencies.json`.

## Default: multi-select (no arguments)

Do **not** run a full install. Do **not** run the script with no filters from
this skill. The user does not have to install every tool on day one.

1. Read `cli-dependencies.json` and list every `id` (and a one-line why from
   `requiredBy` / `manualInstall`). Offer a **multi-select** of those tools.
   Use the host's native multi-select when it has one; otherwise a numbered
   list and accept several numbers, several ids, or `all`. Include **Select
   all** as an explicit choice (that is the `--all` path).

2. Probe only the chosen ids. For a subset:

   ```
   node <resolved-path-to>/scripts/bootstrap-clis.ts --check --only <id>,<id>
   ```

   For select-all:

   ```
   node <resolved-path-to>/scripts/bootstrap-clis.ts --check --all
   ```

   Exit code 0 means those tools are ready; stop and say so.

3. If anything is `MISSING` or `OUTDATED`, show that list and **ask yes/no
   before installing**. No consent → stop; leave the machine unchanged.

4. After a yes, install only the approved ids (or `--all` when they chose
   select-all):

   ```
   node <resolved-path-to>/scripts/bootstrap-clis.ts --only <id>,<id>
   ```

5. Read the report (status table below). Re-run `--check` on the same subset
   after any manual step. Do not claim the machine is ready without a passing
   `--check` for the chosen tools.

`--skills <name>` is for power users who already know which skill they want;
it installs the union of CLIs whose `requiredBy` names that skill. Prefer the
multi-select of tool ids for the default ask.

## When another skill needs a missing CLI

Other skills must **not** send the user to `/bootstrap-clis` or ask them to
learn this skill. The whole interaction is: name the one missing tool, say
why (for example GitHub Issues needs `gh`), ask **yes/no** to install it.

- Yes → `node <resolved-path-to>/scripts/bootstrap-clis.ts --only <id>`
- No → stop with the printed `manualInstall` hint

A `--check --only <id>` first is enough to see `MISSING` / `OUTDATED` /
`NEEDS_AUTH`. Do not install anything else. Do not mention this skill's name
unless the user asked for it.

## Script flags

| Flag | Effect |
|---|---|
| *(none)* | Full reconcile of every contract entry. Kept for script backwards compatibility; this skill never uses it |
| `--all` | Same full set, named on purpose (developer / fresh machine / select-all) |
| `--only <id>,<id>` | Only those CLI ids |
| `--skills <name>` | Union of entries whose `requiredBy` intersects the skill names (repeatable) |
| `--check` | Probe the selected subset; do not install |

`--check` and the install run both honour the same subset. Combining `--all`
with `--only` or `--skills`, or `--only` with `--skills`, is an error.

## Status table

| Status | What it means | What to do |
|---|---|---|
| `OK` / `INSTALLED` / `UPDATED` | Satisfied | Nothing |
| `NEEDS_AUTH` | Installed, not authenticated | Give the user the printed command; do not run it for them |
| `NEEDS_PATH` | Binary placed, not resolvable | Tell the user to add `~/.local/bin` to PATH, then re-run |
| `MISSING` | Absent, no install ran (no `install` strategy for this entry, or the run was `--check`) | If the detail says the install was skipped for `--check`, ask to install that subset; otherwise give the user the `manualInstall` hint |
| `MISSING` for `glab` | The GitLab CLI is absent | Not blocking for a machine that works on no GitLab repos - say so, and give the `manualInstall` hint only when the user works on a GitLab-hosted repo (`vcs: gitlab`). A `--only glab` / `--all` run still exits 1 |
| `OUTDATED` | Present but below `minVersion`, no install ran (same two causes as `MISSING`) | Same as `MISSING` |
| `UNSUPPORTED` | No install path for this platform | Give the `manualInstall` hint |
| `FAILED` | Install ran and did not work | Report the detail verbatim; do not substitute another architecture |
| `UNKNOWN` | Version output did not match the pattern | The contract's `versionRegex` is wrong; fix the contract |

## Boundaries

Never run `auth login` flows on the user's behalf; they involve credentials and
a browser. Print the command and stop.

Never edit `cli-dependencies.json` to make a run pass. A failing entry is a
finding, not an obstacle.

Adding an entry requires naming, in `requiredBy`, either a directory under
`skills/` or an existing `hooks/*.ts` file. The validator rejects any other
name. Run
`node <resolved-path-to>/scripts/validate-cli-dependencies.ts` (same
resolution as above) after editing the contract.
