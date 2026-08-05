# Bootstrap CLIs — design

Status: implemented
Date: 2026-08-05

## Problem

Setting up a new machine means installing, by hand, every CLI the skills in
this repo assume exists. Nothing declares that set, so the requirements live
only in whichever SKILL.md happens to invoke a command. A missing or outdated
CLI surfaces as a failed command mid-task, not as a clear "your machine is not
ready" signal.

The existing `agent-skills-sync.sh/.ps1` plus `~/.config/agent-skills/manifest.json`
solve exactly this shape of problem for *skills*. Nothing solves it for the
CLIs those skills depend on.

## Scope

In scope: CLIs that skills in this repo require in order to function.

Out of scope: the wider developer toolbelt. An entry earns its place only by
naming at least one skill that needs it.

## Decisions

### Contract lives with the skills, not with the machine

`cli-dependencies.json` sits in this repo, next to the skills that declare the
requirements. When a skill starts depending on a new command, the requirement
and its version pin change in the same commit and the same review.

The alternative — extending `~/.config/agent-skills/manifest.json` — was
rejected. That file describes *what is installed on this machine*; the
contract describes *what the skills require*. Different lifetimes, so a shared
file drifts: the pin sits in one repo while the skill that assumes it changes
in another.

A chezmoi `run_onchange_` script was also rejected: it would run automatically
on a new machine (its main appeal) but splits the contract away from the skills
into a third repo, and cannot adapt when an install path fails.

### `linear` CLI: joa23/linear-cli, not schpet/linear-cli

Measured on this machine (Snapdragon X Elite, Windows 11 ARM64), 10 invocations
of `--version`, two rounds:

| CLI | Runtime | Per invocation | Binary |
|---|---|---|---|
| joa23/linear-cli (emulated x64) | Go | ~0.14 s | 11.6 MB |
| nesszer/linear-cli (emulated x64) | Rust | ~0.15 s | 19 MB |
| schpet/linear-cli (native ARM64) | Deno | ~0.92 s | 137 MB |
| schpet/linear-cli (emulated x64) | Deno | ~1.33 s | 161 MB |

A compiled CLI under x64 emulation is ~6.5x faster than `deno compile` output
running natively. Runtime choice dominates the emulation question by an order
of magnitude.

joa23/linear-cli was chosen over nesszer/linear-cli for two reasons beyond
speed: token efficiency is a stated project goal, exposed as
`--format minimal|compact|detailed|full`, `--output text|json` and a default
`--limit 10`; and it ships `linear skills` / `linear tasks` for Claude Code
integration. Accepted gaps: no `documents`, `milestones`, or `initiatives`
commands.

nesszer/linear-cli remains the fallback if those gaps bite — it is a feature
superset of schpet's surface and exposes `api` for raw GraphQL. Its risks are
a pre-1.0 version line (0.3.x), an owner rename (README points at
`Finesssee/linear-cli`), and a latest release carrying one platform asset
despite documenting five.

Forking schpet to add ARM64 CI builds was rejected: it buys the 0.9 s Deno
startup floor permanently in exchange for maintaining a fork.

### Verified facts about building schpet's CLI

Recorded because the investigation cost real time and the conclusion is not
obvious from its repository.

schpet/linear-cli is TypeScript on Deno, not Rust. Its Rust-style target
triples come from `dist` (formerly cargo-dist), which packages the artifacts;
`deno compile` produces them. The 137–161 MB binaries are the bundled Deno
runtime, not debug symbols, and cannot be slimmed.

`deno compile --target aarch64-pc-windows-msvc` works — Deno ships a native
Windows ARM64 build, so upstream's missing triple is a CI configuration gap,
not a technical limit. The build requires `deno task codegen` first, which
`dist-workspace.toml` does not mention; it lives in `.github/build-setup.yml`.
Without it the compile fails with 74 `TS7006` errors.

### Install strategies are data, not shell strings

An `install` entry declares a `download`: an archive URL plus the binary path
inside it. The script fetches, verifies, extracts and places the binary.

It verifies the archive against the entry's `checksums` URL before extracting,
matching by filename. When `checksums` is absent the download proceeds and the
report states that it was unverified — silence would misrepresent an unverified
binary as a checked one.

An earlier draft of this design also defined `run` (an argv package-manager
command) and `build` (source repo, ref, argv build command). Both were dropped
before implementation: the initial contract uses neither, and `build` existed
only to compile Deno for Windows ARM64 — the path abandoned when the `linear`
CLI changed to joa23. Shipping two unused strategies to keep the format
"complete" is speculative surface; re-adding one when an entry needs it is a
small change.

Where a command does appear — the `tar` invocation — it is an `argv` array,
never a shell string. `curl … | sh` cannot run on `cmd.exe`, which is the shell
Node uses on Windows when `shell: true`, and depending on Git Bash being
present would be an unstated dependency.

### The script never crosses the human boundary

Two classes of work stay with the user: authentication, and recovery from a
failed install. The script reports both and stops.

A failed `build` does not silently fall back to a different architecture's
prebuilt binary. Silent architecture substitution is the kind of help that
leaves you unable to say what is actually installed.

## Components

| Component | Responsibility | Explicitly not |
|---|---|---|
| `cli-dependencies.json` (repo root) | Declares required CLIs and minimum versions | Knows nothing about any machine |
| `scripts/bootstrap-clis.ts` | Probe, install, report | Makes no decisions, performs no auth |
| `skills/bootstrap-clis/SKILL.md` | Entry point; runs the script, interprets failures, walks the user through auth | Contains no install logic |

`scripts/` is Node ESM TypeScript with its own `tsconfig.json` and no
`package.json`. Node 24 strips types natively, so `node scripts/bootstrap-clis.ts`
runs directly on all three platforms — one implementation rather than the
`.sh` + `.ps1` pair `agent-skills-sync` maintains. Verified on Node v24.19.0.

Two constraints follow, both verified rather than assumed:

Imports must carry the `.ts` extension. Node resolves `./types/cli-dependencies.ts`
but not `./types/cli-dependencies.js`, and the existing `validate-evals.ts` uses
the latter — the `NodeNext` convention for `tsc`, which never executes under
plain `node`. `scripts/tsconfig.json` therefore needs
`"allowImportingTsExtensions": true`, which its existing `"noEmit": true` already
permits.

`scripts/validate-evals.ts` is the only precedent for style, not a working
example to copy: it is referenced nowhere in the repo and carries a deliberate
typo (`raw.eval_cases` against a field named `evals`) as an LSP fixture. It
informs naming and file layout, nothing more.

No npm dependencies. Version comparison is a numeric split on `.`, which is
sufficient for `1.10.0` vs `1.9.0`. Adding `package.json` would pull in a
lockfile, `node_modules`, and a CI question.

## Contract format

```json
{
  "clis": [
    {
      "id": "linear",
      "minVersion": "1.10.0",
      "versionCommand": ["linear", "--version"],
      "versionRegex": "linear version (\\d+\\.\\d+\\.\\d+)",
      "requiredBy": ["linear-issue-workflow", "linear-issue-writer", "linear-issue-close"],
      "releaseBase": "https://github.com/joa23/linear-cli/releases/download/v{version}",
      "checksums": "{releaseBase}/checksums.txt",
      "install": {
        "darwin-arm64": { "download": "{releaseBase}/linear-cli_Darwin_arm64.tar.gz",  "binary": "linear" },
        "darwin-x64":   { "download": "{releaseBase}/linear-cli_Darwin_x86_64.tar.gz", "binary": "linear" },
        "linux-arm64":  { "download": "{releaseBase}/linear-cli_Linux_arm64.tar.gz",   "binary": "linear" },
        "linux-x64":    { "download": "{releaseBase}/linear-cli_Linux_x86_64.tar.gz",  "binary": "linear" },
        "win32-x64":    { "download": "{releaseBase}/linear-cli_Windows_x86_64.tar.gz","binary": "linear.exe" },
        "win32-arm64":  {
          "_comment": "upstream ships no windows/arm64; x64 under emulation costs ~0.14s per call, which is adequate",
          "download": "{releaseBase}/linear-cli_Windows_x86_64.tar.gz",
          "binary": "linear.exe"
        }
      },
      "auth": {
        "check": ["linear", "whoami"],
        "instructions": "Run `linear auth login` and paste a Linear API key from Settings -> API."
      }
    }
  ]
}
```

`auth.check` is `["linear", "whoami"]`, not `["linear", "auth", "status"]` as an
earlier draft had it: `auth status` was found to exit 0 even when logged out,
so its exit code cannot signal failure and it is the wrong command to use as
a gate.

Four properties of this shape are load-bearing:

`requiredBy` forces every entry to justify itself by naming a skill. The
validator rejects a name that is not a directory under `skills/`, so the
narrow-scope rule is enforced mechanically rather than by discipline.

Platform keys are `<platform>-<arch>` from `process.platform` and
`process.arch`, so `win32-arm64` is addressable separately from `win32-x64`.
Today's finding — that upstream ships no Windows ARM64 build — is recorded as
data. When that changes, one line changes. An entry that declares `install` but
omits the running platform's key reports `UNSUPPORTED` with its
`manualInstall` guidance; it is not silently treated as verify-only, because
"nobody wrote an install path for your platform" and "this one is installed by
hand everywhere" are different facts.

An entry may omit `install`. It is then verify-only: the script reports whether
it is present and at what version, and prints `manualInstall` guidance if not.
This covers prerequisites the script cannot install because it depends on them
(`node`, `git`) without introducing a second concept.

`{version}` interpolates `minVersion`, so a `build` strategy compiles the
matching tag rather than `main`. A build from `HEAD` is not reproducible and
would make the version pin meaningless. `{releaseBase}` expands the entry's own
`releaseBase`, keeping the pinned version in exactly one place per entry —
six URLs that must agree on a version number are six chances to disagree.

## Initial entries

Derived by searching `skills/` for actual command invocations, not from memory:

| id | Installable | `requiredBy` |
|---|---|---|
| `linear` | yes | linear-issue-workflow, linear-issue-writer, linear-issue-close, new-project-workflow |
| `gh` | verify-only (`manualInstall`) | linear-issue-workflow, linear-issue-close, new-project-workflow |
| `rg` | verify-only (`manualInstall`) | nerdbrain-search, linear-issue-workflow |
| `git` | verify-only (`manualInstall`) | linear-issue-workflow, linear-issue-close, new-project-workflow |

Four entries. Anything proposed later must name a skill under `skills/` or the
validator rejects it.

`node` is deliberately absent. It cannot be missing at the moment the report is
produced — the script runs on it — and the Node 24 floor enforces itself, since
an older Node cannot parse the `.ts` files at all. An entry whose `requiredBy`
had to be invented to pass validation would be data bent to fit the schema.

## Behaviour

Each CLI is processed independently; one failure does not mask the rest.

```
resolve platform key (process.platform + process.arch)
   |
probe: versionCommand -> versionRegex
   |-- binary absent ..................... MISSING
   |-- regex does not match .............. UNKNOWN   (report, change nothing)
   |-- version < minVersion .............. OUTDATED
   `-- otherwise ......................... OK
   |
   v  (MISSING | OUTDATED, and install is declared)
apply install strategy -> RE-PROBE
   |-- now satisfies minVersion .......... INSTALLED / UPDATED
   |-- binary exists but not on PATH ..... NEEDS_PATH
   `-- still unsatisfied ................. FAILED
   |
   v  (OK | INSTALLED | UPDATED, and auth is declared)
auth.check -> non-zero exit ............... NEEDS_AUTH
```

The re-probe is the point of the design. An install command exiting 0 proves
the installer did not crash, not that the CLI works — on this machine, placing
`linear.exe` succeeded while visibility depended on `PATH`. Status is reported
from a second measurement, never assumed from the first.

`NEEDS_PATH` is distinct from `FAILED` because they lead to different actions:
add a directory to `PATH`, versus the install did not work. Merging them would
discard a diagnosis the script has already made.

Modes: default reconciles; `--check` probes and reports without changing
anything. Exit code is 0 only when every entry ends `OK`, which makes `--check`
usable as a verification gate. A second consecutive run must report all `OK`
and change nothing.

## Verification

Mirrors the existing `scripts/validate-evals.ts` and `scripts/types/evals.ts`
pattern: `scripts/types/cli-dependencies.ts` holds the type and a validator
checking required fields, platform keys against a known set, semver-shaped
`minVersion`, and that every `requiredBy` names a real directory under
`skills/`.

The validator also compiles every `versionRegex`, and the orchestrator runs it
before probing anything. A malformed pattern is a contract defect: caught at
validation it names the broken entry, while an unvalidated one throws out of
`new RegExp` inside the probe and would otherwise surface as `UNKNOWN` for a CLI
that is installed and working.

The acceptance test is `--check` on this machine, followed by a second run
proving idempotence.

Unit tests were added after all, using Node's built-in `node:test` runner:
one file per pure module (`version`, `platform`, `probe`, `install`,
`status`, plus the contract validator itself), 39 tests in total. The
no-npm constraint made this cheap rather than a reason to skip it — `node
--test` needs no dependency, so TDD cost nothing against it. Tests cover the
pure decision functions (version comparison, platform key resolution,
checksum parsing, status transitions); the parts that need a live network or
filesystem (`applyInstall`'s download path) stay covered by the validator and
`--check` against this machine, not by unit tests.

## Consequences and follow-up work

Switching the `linear` CLI invalidates the Linear command syntax currently
encoded in this repo: 25 call sites across 8 files (`linear-issue-workflow`,
`linear-issue-writer`, `linear-issue-close`, `new-project-workflow`,
`nerdbrain-wiki` templates, `README.md`), plus the `linear-cli` skill sourced
from `pawelwlazlo/linear-skills`, which documents schpet's surface. Rewriting
those is separate work and is not covered by this design.

`linear skills install` ships Claude Code skills from the CLI itself and may
replace part of that rewrite. Not yet evaluated.

Real token cost per operation was never measured — the benchmarks above compare
`--version`, not `issues list` against a live workspace. Token efficiency drove
the CLI choice but rests on the documented `--format`/`--limit` controls, not
on measurement. Worth confirming once authenticated.

Upstream `joa23/linear-cli` builds via goreleaser and ships no `windows/arm64`
target; adding one is a single line in `.goreleaser.yaml`. A PR would remove
the emulation dependency for this machine.

schpet's v2.3.1 binary was installed to `~/.local/bin/linear.exe` during this
investigation and has since been removed, so no `linear` is on `PATH`. The
first `--check` run is therefore expected to report `MISSING` for it.

## Prerequisites this design cannot cover

A skill cannot be the first step on a bare machine, because invoking it
requires Claude Code, this plugin, and git already present. The order is:

```
git + node + claude  ->  agent-skills-sync  ->  /bootstrap-clis
```

`git` appears in the contract as a verify-only entry so that `--check`
reports it. `node` does not appear at all — see "Initial entries" above —
but the script cannot install what it runs on either way.
