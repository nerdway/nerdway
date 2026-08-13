---
name: bootstrap-clis
description: Bring this machine to the CLI state the skills in this repo require - probe every entry in cli-dependencies.json, install or update what is missing or outdated, and hand back the authentication steps only a human can complete. Use for `/nerd4rent:bootstrap-clis`, on a freshly set up machine, or when a skill fails because a command like `linearis`, `gh`, or `rg` is missing or too old.
---

# Bootstrap CLIs

`cli-dependencies.json` at the repo root declares which CLIs the skills here
require. `scripts/bootstrap-clis.ts` reconciles this machine against it.

## Steps

This skill is typically invoked from a project that is not this repo, so the
script cannot be found relative to the current working directory. Instead,
resolve it relative to this skill's own base directory, which you are told
when this skill is invoked. This file lives at
`<skill base directory>/SKILL.md`, i.e. `<plugin root>/skills/bootstrap-clis/`;
go two directories up from the skill base directory to reach the plugin
root, then into `scripts/`, to get the absolute path
`<plugin root>/scripts/bootstrap-clis.ts`. Use that absolute path — not the
bare relative one — in every command below.

1. Report the current state before changing anything:

   ```
   node <resolved-path-to>/scripts/bootstrap-clis.ts --check
   ```

   Exit code 0 means the machine is ready; stop and say so.

2. Reconcile:

   ```
   node <resolved-path-to>/scripts/bootstrap-clis.ts
   ```

3. Read the report and act on each status:

   | Status | What it means | What to do |
   |---|---|---|
   | `OK` / `INSTALLED` / `UPDATED` | Satisfied | Nothing |
   | `NEEDS_AUTH` | Installed, not authenticated | Give the user the printed command; do not run it for them |
   | `NEEDS_PATH` | Binary placed, not resolvable | Tell the user to add `~/.local/bin` to PATH, then re-run |
   | `MISSING` | Absent, no install ran (no `install` strategy for this entry, or the run was `--check`) | If the detail says the install was skipped for `--check`, re-run without `--check`; otherwise give the user the `manualInstall` hint |
   | `OUTDATED` | Present but below `minVersion`, no install ran (same two causes as `MISSING`) | Same as `MISSING` |
   | `UNSUPPORTED` | No install path for this platform | Give the `manualInstall` hint |
   | `FAILED` | Install ran and did not work | Report the detail verbatim; do not substitute another architecture |
   | `UNKNOWN` | Version output did not match the pattern | The contract's `versionRegex` is wrong; fix the contract |

4. Re-run `--check` after the user completes any manual step, and report the
   result. Do not claim the machine is ready without a passing `--check`.

## Boundaries

Never run `auth login` flows on the user's behalf; they involve credentials and
a browser. Print the command and stop.

Never edit `cli-dependencies.json` to make a run pass. A failing entry is a
finding, not an obstacle.

Adding an entry requires naming a skill under `skills/` in `requiredBy`; the
validator rejects anything else. Run
`node <resolved-path-to>/scripts/validate-cli-dependencies.ts` (same
resolution as above) after editing the contract.
