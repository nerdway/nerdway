# Bootstrap CLIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A declarative contract plus one cross-platform script that brings a machine to the CLI state this repo's skills require, reporting anything a human must finish.

**Architecture:** `cli-dependencies.json` at the repo root declares required CLIs and minimum versions. `scripts/bootstrap-clis.ts` probes each one, installs or updates what it can, re-probes to confirm, and reports statuses. A skill wraps the script as the entry point and walks the user through authentication. Design rationale lives in `docs/superpowers/specs/2026-08-05-bootstrap-clis-design.md`.

**Tech Stack:** Node 24 (native TypeScript type stripping), `node:test` built-in runner, `node:crypto`, global `fetch`, system `tar`.

## Global Constraints

- **No npm dependencies.** No `package.json`, no lockfile, no `node_modules`. Everything comes from `node:` builtins or system binaries.
- **Node 24 runs `.ts` directly.** Verified on v24.19.0. Every local import MUST carry the `.ts` extension (`./version.ts`, not `./version.js`) or Node cannot resolve it.
- **No code comments.** Repo rule (`~/.claude/CLAUDE.md` Coding discipline §5): no `//`, `/* */`, `#`, or descriptive docstrings. Express intent through naming and structure. Allowed only: shebangs and tool directives. Scan the diff before reporting a task done.
- **Commands are `argv` arrays, never shell strings.** `shell: true` resolves to `cmd.exe` on Windows; a piped `curl … | sh` would not run.
- **Commit messages in Polish**, starting with a declarative noun form (`Dodanie`, `Poprawa`). Never add yourself as co-author.
- **Install target:** `path.join(os.homedir(), ".local", "bin")` — already on `PATH` on this machine.
- **Archives are `.tar.gz` on all platforms**, extracted via the system `tar` binary.
- **Every test runs with:** `node --test <file>` from the repo root.

---

### Task 1: Contract type, validator, and the contract itself

**Files:**
- Modify: `scripts/tsconfig.json`
- Create: `scripts/types/cli-dependencies.ts`
- Create: `scripts/types/cli-dependencies.test.ts`
- Create: `cli-dependencies.json`
- Create: `scripts/validate-cli-dependencies.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `PlatformKey`, `InstallStrategy`, `CliEntry`, `CliContract`, `validateContract(raw: unknown, skillDirs: string[]): string[]`

- [ ] **Step 1: Allow `.ts` import specifiers**

`scripts/validate-evals.ts` imports `./types/evals.js`, which `tsc` accepts but Node cannot resolve. New files use `.ts` specifiers, so `tsc` needs permission for that form. Add one key to `scripts/tsconfig.json` `compilerOptions`:

```json
"allowImportingTsExtensions": true
```

- [ ] **Step 2: Write the failing validator tests**

Create `scripts/types/cli-dependencies.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateContract } from "./cli-dependencies.ts";

const skillDirs = ["linear-issue-workflow", "nerdbrain-search"];

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "linear",
    minVersion: "1.10.0",
    versionCommand: ["linear", "--version"],
    versionRegex: "linear version (\\d+\\.\\d+\\.\\d+)",
    requiredBy: ["linear-issue-workflow"],
    ...overrides,
  };
}

test("accepts a minimal valid contract", () => {
  assert.deepEqual(validateContract({ clis: [entry()] }, skillDirs), []);
});

test("rejects a requiredBy naming no existing skill directory", () => {
  const errors = validateContract({ clis: [entry({ requiredBy: ["ghost-skill"] })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost-skill/);
});

test("rejects an empty requiredBy", () => {
  const errors = validateContract({ clis: [entry({ requiredBy: [] })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /requiredBy/);
});

test("rejects a minVersion that is not three numeric segments", () => {
  const errors = validateContract({ clis: [entry({ minVersion: "1.10" })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /minVersion/);
});

test("rejects an unknown platform key", () => {
  const install = { "win32-riscv": { run: ["true"] } };
  const errors = validateContract({ clis: [entry({ install })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /win32-riscv/);
});

test("rejects a download strategy missing binary", () => {
  const install = { "linux-x64": { download: "https://example.test/a.tar.gz" } };
  const errors = validateContract({ clis: [entry({ install })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /binary/);
});

test("rejects a duplicate id", () => {
  const errors = validateContract({ clis: [entry(), entry()] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate/i);
});

test("reports every problem rather than stopping at the first", () => {
  const bad = entry({ requiredBy: [], minVersion: "x" });
  assert.equal(validateContract({ clis: [bad] }, skillDirs).length, 2);
});

test("rejects a non-object payload", () => {
  assert.equal(validateContract(null, skillDirs).length, 1);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test scripts/types/cli-dependencies.test.ts`
Expected: FAIL — cannot resolve `./cli-dependencies.ts`

- [ ] **Step 4: Write the types and validator**

Create `scripts/types/cli-dependencies.ts`:

```typescript
export const PLATFORM_KEYS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export type InstallStrategy =
  | { download: string; binary: string; _comment?: string }
  | { run: string[]; _comment?: string }
  | { build: { repo: string; ref: string; run: string[] }; requires?: string[]; _comment?: string };

export interface CliEntry {
  id: string;
  minVersion: string;
  versionCommand: string[];
  versionRegex: string;
  requiredBy: string[];
  releaseBase?: string;
  checksums?: string;
  manualInstall?: string;
  install?: Partial<Record<PlatformKey, InstallStrategy>>;
  auth?: { check: string[]; instructions: string };
}

export interface CliContract {
  clis: CliEntry[];
}

const VERSION_SHAPE = /^\d+\.\d+\.\d+$/;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateStrategy(id: string, key: string, strategy: unknown, errors: string[]): void {
  if (typeof strategy !== "object" || strategy === null) {
    errors.push(`${id}: install.${key} must be an object`);
    return;
  }
  const s = strategy as Record<string, unknown>;
  if ("download" in s) {
    if (typeof s.download !== "string") errors.push(`${id}: install.${key}.download must be a string`);
    if (typeof s.binary !== "string") errors.push(`${id}: install.${key} needs a binary path inside the archive`);
    return;
  }
  if ("run" in s) {
    if (!isStringArray(s.run)) errors.push(`${id}: install.${key}.run must be an argv array`);
    return;
  }
  if ("build" in s) {
    const build = s.build as Record<string, unknown> | null;
    if (typeof build !== "object" || build === null) {
      errors.push(`${id}: install.${key}.build must be an object`);
      return;
    }
    if (typeof build.repo !== "string") errors.push(`${id}: install.${key}.build.repo must be a string`);
    if (typeof build.ref !== "string") errors.push(`${id}: install.${key}.build.ref must be a string`);
    if (!isStringArray(build.run)) errors.push(`${id}: install.${key}.build.run must be an argv array`);
    return;
  }
  errors.push(`${id}: install.${key} must declare download, run, or build`);
}

function validateEntry(raw: unknown, skillDirs: string[], seen: Set<string>, errors: string[]): void {
  if (typeof raw !== "object" || raw === null) {
    errors.push("each clis entry must be an object");
    return;
  }
  const e = raw as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id : "<missing id>";

  if (typeof e.id !== "string" || e.id.length === 0) errors.push("entry is missing a string id");
  else if (seen.has(e.id)) errors.push(`duplicate id: ${e.id}`);
  else seen.add(e.id);

  if (typeof e.minVersion !== "string" || !VERSION_SHAPE.test(e.minVersion)) {
    errors.push(`${id}: minVersion must look like 1.10.0`);
  }
  if (!isStringArray(e.versionCommand) || e.versionCommand.length === 0) {
    errors.push(`${id}: versionCommand must be a non-empty argv array`);
  }
  if (typeof e.versionRegex !== "string") {
    errors.push(`${id}: versionRegex must be a string`);
  }
  if (!isStringArray(e.requiredBy) || e.requiredBy.length === 0) {
    errors.push(`${id}: requiredBy must name at least one skill`);
  } else {
    for (const skill of e.requiredBy) {
      if (!skillDirs.includes(skill)) errors.push(`${id}: requiredBy names ${skill}, which is not a directory under skills/`);
    }
  }
  if (e.install !== undefined) {
    if (typeof e.install !== "object" || e.install === null) {
      errors.push(`${id}: install must be an object`);
    } else {
      for (const [key, strategy] of Object.entries(e.install)) {
        if (!(PLATFORM_KEYS as readonly string[]).includes(key)) {
          errors.push(`${id}: unknown platform key ${key}`);
          continue;
        }
        validateStrategy(id, key, strategy, errors);
      }
    }
  }
  if (e.auth !== undefined) {
    const auth = e.auth as Record<string, unknown> | null;
    if (typeof auth !== "object" || auth === null) errors.push(`${id}: auth must be an object`);
    else {
      if (!isStringArray(auth.check)) errors.push(`${id}: auth.check must be an argv array`);
      if (typeof auth.instructions !== "string") errors.push(`${id}: auth.instructions must be a string`);
    }
  }
}

export function validateContract(raw: unknown, skillDirs: string[]): string[] {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as Record<string, unknown>).clis)) {
    return ["contract must be an object with a clis array"];
  }
  const seen = new Set<string>();
  for (const entry of (raw as CliContract).clis) {
    validateEntry(entry, skillDirs, seen, errors);
  }
  return errors;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test scripts/types/cli-dependencies.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 6: Write the contract**

Create `cli-dependencies.json` at the repo root. Versions and asset names are taken from `joa23/linear-cli` v1.10.0.

```json
{
  "_comment": "CLIs required by skills in this repo. Every entry must name a skill under skills/ in requiredBy; scripts/validate-cli-dependencies.ts enforces it.",
  "clis": [
    {
      "id": "linear",
      "minVersion": "1.10.0",
      "versionCommand": ["linear", "--version"],
      "versionRegex": "linear version (\\d+\\.\\d+\\.\\d+)",
      "requiredBy": ["linear-issue-workflow", "linear-issue-writer", "linear-issue-close", "new-project-workflow"],
      "releaseBase": "https://github.com/joa23/linear-cli/releases/download/v{version}",
      "checksums": "{releaseBase}/checksums.txt",
      "install": {
        "darwin-arm64": { "download": "{releaseBase}/linear-cli_Darwin_arm64.tar.gz", "binary": "linear" },
        "darwin-x64": { "download": "{releaseBase}/linear-cli_Darwin_x86_64.tar.gz", "binary": "linear" },
        "linux-arm64": { "download": "{releaseBase}/linear-cli_Linux_arm64.tar.gz", "binary": "linear" },
        "linux-x64": { "download": "{releaseBase}/linear-cli_Linux_x86_64.tar.gz", "binary": "linear" },
        "win32-x64": { "download": "{releaseBase}/linear-cli_Windows_x86_64.tar.gz", "binary": "linear.exe" },
        "win32-arm64": {
          "_comment": "upstream ships no windows/arm64; the x64 build under emulation costs ~0.14s per call",
          "download": "{releaseBase}/linear-cli_Windows_x86_64.tar.gz",
          "binary": "linear.exe"
        }
      },
      "auth": {
        "check": ["linear", "auth", "status"],
        "instructions": "Run `linear auth login` and paste an API key from Linear Settings -> API."
      }
    },
    {
      "id": "gh",
      "minVersion": "2.97.0",
      "versionCommand": ["gh", "--version"],
      "versionRegex": "gh version (\\d+\\.\\d+\\.\\d+)",
      "requiredBy": ["linear-issue-workflow", "linear-issue-close", "new-project-workflow"],
      "manualInstall": "winget install GitHub.cli | brew install gh | see https://github.com/cli/cli#installation",
      "auth": {
        "check": ["gh", "auth", "status"],
        "instructions": "Run `gh auth login` and complete the browser flow."
      }
    },
    {
      "id": "rg",
      "minVersion": "14.0.0",
      "versionCommand": ["rg", "--version"],
      "versionRegex": "ripgrep (\\d+\\.\\d+\\.\\d+)",
      "requiredBy": ["nerdbrain-search", "linear-issue-workflow"],
      "manualInstall": "winget install BurntSushi.ripgrep.MSVC | brew install ripgrep | apt install ripgrep"
    },
    {
      "id": "git",
      "minVersion": "2.40.0",
      "versionCommand": ["git", "--version"],
      "versionRegex": "git version (\\d+\\.\\d+\\.\\d+)",
      "requiredBy": ["linear-issue-workflow", "linear-issue-close", "new-project-workflow"],
      "manualInstall": "Install git before running this script; it is a prerequisite, not a target."
    },
    {
      "id": "node",
      "minVersion": "24.0.0",
      "versionCommand": ["node", "--version"],
      "versionRegex": "v(\\d+\\.\\d+\\.\\d+)",
      "requiredBy": ["linear-issue-workflow"],
      "manualInstall": "This script runs on Node; if you are reading this, it is already installed. Node 24+ is required for native TypeScript execution."
    }
  ]
}
```

- [ ] **Step 7: Write the validator entry point**

Create `scripts/validate-cli-dependencies.ts`:

```typescript
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateContract } from "./types/cli-dependencies.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const skillDirs = readdirSync(join(repoRoot, "skills"), { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "cli-dependencies.json"), "utf8"));
const errors = validateContract(raw, skillDirs);

if (errors.length > 0) {
  console.error("cli-dependencies.json validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${(raw as { clis: unknown[] }).clis.length} CLI entries validated`);
```

- [ ] **Step 8: Run the validator against the real contract**

Run: `node scripts/validate-cli-dependencies.ts`
Expected: `OK: 5 CLI entries validated`

- [ ] **Step 9: Commit**

```bash
git add scripts/tsconfig.json scripts/types/cli-dependencies.ts scripts/types/cli-dependencies.test.ts cli-dependencies.json scripts/validate-cli-dependencies.ts
git commit -m "Dodanie kontraktu zaleznosci CLI wraz z walidatorem"
```

---

### Task 2: Version comparison and platform resolution

**Files:**
- Create: `scripts/lib/version.ts`
- Create: `scripts/lib/version.test.ts`
- Create: `scripts/lib/platform.ts`
- Create: `scripts/lib/platform.test.ts`

**Interfaces:**
- Consumes: `PlatformKey`, `PLATFORM_KEYS` from `scripts/types/cli-dependencies.ts`
- Produces: `extractVersion(output: string, pattern: string): string | null`, `compareVersions(a: string, b: string): number`, `satisfiesMinimum(found: string, minimum: string): boolean`, `platformKey(platform: string, arch: string): PlatformKey | null`

- [ ] **Step 1: Write the failing version tests**

Create `scripts/lib/version.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { compareVersions, extractVersion, satisfiesMinimum } from "./version.ts";

test("compares numerically, not lexically", () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.9.0", "1.10.0"), -1);
});

test("treats equal versions as equal", () => {
  assert.equal(compareVersions("2.3.1", "2.3.1"), 0);
});

test("orders by major before minor before patch", () => {
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("1.2.10", "1.2.9"), 1);
});

test("satisfiesMinimum accepts equal and newer", () => {
  assert.equal(satisfiesMinimum("1.10.0", "1.10.0"), true);
  assert.equal(satisfiesMinimum("1.11.0", "1.10.0"), true);
  assert.equal(satisfiesMinimum("1.9.0", "1.10.0"), false);
});

test("extracts the first capture group", () => {
  assert.equal(extractVersion("linear version 1.10.0", "linear version (\\d+\\.\\d+\\.\\d+)"), "1.10.0");
  assert.equal(extractVersion("v24.19.0", "v(\\d+\\.\\d+\\.\\d+)"), "24.19.0");
});

test("extracts from multi-line output", () => {
  const output = "gh version 2.97.0 (2026-07-31)\nhttps://github.com/cli/cli";
  assert.equal(extractVersion(output, "gh version (\\d+\\.\\d+\\.\\d+)"), "2.97.0");
});

test("returns null when the pattern does not match", () => {
  assert.equal(extractVersion("something else entirely", "linear version (\\d+\\.\\d+\\.\\d+)"), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/version.test.ts`
Expected: FAIL — cannot resolve `./version.ts`

- [ ] **Step 3: Implement version.ts**

Create `scripts/lib/version.ts`:

```typescript
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

export function satisfiesMinimum(found: string, minimum: string): boolean {
  return compareVersions(found, minimum) >= 0;
}

export function extractVersion(output: string, pattern: string): string | null {
  const match = new RegExp(pattern).exec(output);
  return match?.[1] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/lib/version.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Write the failing platform tests**

Create `scripts/lib/platform.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { platformKey } from "./platform.ts";

test("builds a key from platform and arch", () => {
  assert.equal(platformKey("win32", "arm64"), "win32-arm64");
  assert.equal(platformKey("darwin", "arm64"), "darwin-arm64");
  assert.equal(platformKey("linux", "x64"), "linux-x64");
});

test("returns null for a combination the contract cannot express", () => {
  assert.equal(platformKey("freebsd", "x64"), null);
  assert.equal(platformKey("win32", "ia32"), null);
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test scripts/lib/platform.test.ts`
Expected: FAIL — cannot resolve `./platform.ts`

- [ ] **Step 7: Implement platform.ts**

Create `scripts/lib/platform.ts`:

```typescript
import { PLATFORM_KEYS, type PlatformKey } from "../types/cli-dependencies.ts";

export function platformKey(platform: string, arch: string): PlatformKey | null {
  const candidate = `${platform}-${arch}`;
  return (PLATFORM_KEYS as readonly string[]).includes(candidate) ? (candidate as PlatformKey) : null;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test scripts/lib/platform.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/version.ts scripts/lib/version.test.ts scripts/lib/platform.ts scripts/lib/platform.test.ts
git commit -m "Dodanie porownywania wersji i rozpoznawania platformy"
```

---

### Task 3: Probing an installed CLI

**Files:**
- Create: `scripts/lib/probe.ts`
- Create: `scripts/lib/probe.test.ts`

**Interfaces:**
- Consumes: `CliEntry` from `scripts/types/cli-dependencies.ts`; `extractVersion`, `satisfiesMinimum` from `scripts/lib/version.ts`
- Produces: `type ProbeResult = { status: "ok" | "outdated"; version: string } | { status: "missing" } | { status: "unknown"; output: string }`, `runCommand(argv: string[], cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }>` (Task 4 passes `cwd` when building from a clone), `probe(entry: CliEntry): Promise<ProbeResult>`

- [ ] **Step 1: Write the failing probe tests**

Tests use `node` itself as the subject, so they need no fixtures and no network. Create `scripts/lib/probe.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { probe, runCommand } from "./probe.ts";
import type { CliEntry } from "../types/cli-dependencies.ts";

function nodeEntry(overrides: Partial<CliEntry> = {}): CliEntry {
  return {
    id: "node",
    minVersion: "24.0.0",
    versionCommand: ["node", "--version"],
    versionRegex: "v(\\d+\\.\\d+\\.\\d+)",
    requiredBy: ["linear-issue-workflow"],
    ...overrides,
  };
}

test("runCommand captures stdout and exit code", async () => {
  const result = await runCommand(["node", "--version"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^v\d+\.\d+\.\d+/);
});

test("runCommand reports a null code for a binary that does not exist", async () => {
  const result = await runCommand(["definitely-not-a-real-binary-xyz"]);
  assert.equal(result.code, null);
});

test("probe reports ok for an installed CLI meeting the minimum", async () => {
  const result = await probe(nodeEntry());
  assert.equal(result.status, "ok");
});

test("probe reports outdated when the minimum is above the installed version", async () => {
  const result = await probe(nodeEntry({ minVersion: "999.0.0" }));
  assert.equal(result.status, "outdated");
  assert.match((result as { version: string }).version, /^\d+\.\d+\.\d+$/);
});

test("probe reports missing for an absent binary", async () => {
  const entry = nodeEntry({ versionCommand: ["definitely-not-a-real-binary-xyz", "--version"] });
  assert.equal((await probe(entry)).status, "missing");
});

test("probe reports unknown when the regex does not match the output", async () => {
  const result = await probe(nodeEntry({ versionRegex: "totally unmatched (\\d+)" }));
  assert.equal(result.status, "unknown");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/probe.test.ts`
Expected: FAIL — cannot resolve `./probe.ts`

- [ ] **Step 3: Implement probe.ts**

Create `scripts/lib/probe.ts`:

```typescript
import { spawn } from "node:child_process";

import type { CliEntry } from "../types/cli-dependencies.ts";
import { extractVersion, satisfiesMinimum } from "./version.ts";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type ProbeResult =
  | { status: "ok"; version: string }
  | { status: "outdated"; version: string }
  | { status: "missing" }
  | { status: "unknown"; output: string };

export function runCommand(argv: string[], cwd?: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", () => resolve({ code: null, stdout, stderr }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function probe(entry: CliEntry): Promise<ProbeResult> {
  const result = await runCommand(entry.versionCommand);
  if (result.code === null) return { status: "missing" };

  const output = `${result.stdout}${result.stderr}`;
  const version = extractVersion(output, entry.versionRegex);
  if (version === null) return { status: "unknown", output: output.trim() };

  return satisfiesMinimum(version, entry.minVersion)
    ? { status: "ok", version }
    : { status: "outdated", version };
}
```

`shell: false` is what makes `argv` arrays safe and keeps behaviour identical across platforms. Version output goes to stderr on some CLIs, so both streams are searched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/lib/probe.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/probe.ts scripts/lib/probe.test.ts
git commit -m "Dodanie sondowania obecnosci i wersji CLI"
```

---

### Task 4: Install strategies

**Files:**
- Create: `scripts/lib/install.ts`
- Create: `scripts/lib/install.test.ts`

**Interfaces:**
- Consumes: `CliEntry`, `InstallStrategy` from `scripts/types/cli-dependencies.ts`; `runCommand` from `scripts/lib/probe.ts`
- Produces: `interpolate(template: string, vars: Record<string, string>): string`, `parseChecksums(text: string): Map<string, string>`, `installDir(): string`, `applyInstall(entry: CliEntry, strategy: InstallStrategy): Promise<{ ok: boolean; detail: string; placedAt?: string }>`

- [ ] **Step 1: Write the failing tests for the pure parts**

Interpolation and checksum parsing are pure and get real tests. Downloading is exercised by the acceptance run in Task 6. Create `scripts/lib/install.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { interpolate, parseChecksums } from "./install.ts";

test("interpolates version into releaseBase", () => {
  const base = interpolate("https://example.test/v{version}", { version: "1.10.0" });
  assert.equal(base, "https://example.test/v1.10.0");
});

test("interpolates releaseBase into an asset url", () => {
  const vars = { version: "1.10.0", releaseBase: "https://example.test/v1.10.0" };
  assert.equal(interpolate("{releaseBase}/app.tar.gz", vars), "https://example.test/v1.10.0/app.tar.gz");
});

test("leaves unknown placeholders untouched", () => {
  assert.equal(interpolate("{nope}/x", { version: "1.0.0" }), "{nope}/x");
});

test("parses a goreleaser checksums file", () => {
  const text = [
    "abc123  linear-cli_Windows_x86_64.tar.gz",
    "def456  linear-cli_Linux_arm64.tar.gz",
    "",
  ].join("\n");
  const sums = parseChecksums(text);
  assert.equal(sums.get("linear-cli_Windows_x86_64.tar.gz"), "abc123");
  assert.equal(sums.size, 2);
});

test("tolerates the binary marker prefix on filenames", () => {
  const sums = parseChecksums("abc123 *linear-cli_Windows_x86_64.tar.gz");
  assert.equal(sums.get("linear-cli_Windows_x86_64.tar.gz"), "abc123");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/install.test.ts`
Expected: FAIL — cannot resolve `./install.ts`

- [ ] **Step 3: Implement install.ts**

Create `scripts/lib/install.ts`:

```typescript
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { CliEntry, InstallStrategy } from "../types/cli-dependencies.ts";
import { runCommand } from "./probe.ts";

export interface InstallOutcome {
  ok: boolean;
  detail: string;
  placedAt?: string;
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^(\S+)\s+\*?(\S+)$/.exec(line.trim());
    if (match) sums.set(match[2], match[1]);
  }
  return sums;
}

export function installDir(): string {
  return join(homedir(), ".local", "bin");
}

function templateVars(entry: CliEntry): Record<string, string> {
  const vars: Record<string, string> = { version: entry.minVersion };
  if (entry.releaseBase) vars.releaseBase = interpolate(entry.releaseBase, vars);
  return vars;
}

async function verifyChecksum(entry: CliEntry, vars: Record<string, string>, archive: Buffer, name: string): Promise<string> {
  if (!entry.checksums) return "checksum not declared, archive unverified";

  const response = await fetch(interpolate(entry.checksums, vars));
  if (!response.ok) return `checksums unreachable (HTTP ${response.status}), archive unverified`;

  const expected = parseChecksums(await response.text()).get(name);
  if (!expected) return `no checksum listed for ${name}, archive unverified`;

  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) throw new Error(`checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
  return "checksum verified";
}

async function installDownload(entry: CliEntry, strategy: Extract<InstallStrategy, { download: string }>): Promise<InstallOutcome> {
  const vars = templateVars(entry);
  const url = interpolate(strategy.download, vars);
  const name = basename(new URL(url).pathname);

  const response = await fetch(url);
  if (!response.ok) return { ok: false, detail: `download failed: HTTP ${response.status} for ${url}` };

  const archive = Buffer.from(await response.arrayBuffer());
  const note = await verifyChecksum(entry, vars, archive, name);

  const work = mkdtempSync(join(tmpdir(), "bootstrap-clis-"));
  try {
    const archivePath = join(work, name);
    writeFileSync(archivePath, archive);

    const extract = await runCommand(["tar", "-xzf", archivePath, "-C", work]);
    if (extract.code !== 0) return { ok: false, detail: `tar failed: ${extract.stderr.trim()}` };

    const extracted = join(work, strategy.binary);
    if (!existsSync(extracted)) return { ok: false, detail: `archive does not contain ${strategy.binary}` };

    const target = join(installDir(), basename(strategy.binary));
    mkdirSync(installDir(), { recursive: true });
    copyFileSync(extracted, target);
    chmodSync(target, 0o755);

    return { ok: true, detail: note, placedAt: target };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function installRun(strategy: Extract<InstallStrategy, { run: string[] }>): Promise<InstallOutcome> {
  const result = await runCommand(strategy.run);
  return result.code === 0
    ? { ok: true, detail: `ran ${strategy.run.join(" ")}` }
    : { ok: false, detail: `${strategy.run.join(" ")} exited ${result.code}: ${result.stderr.trim()}` };
}

async function installBuild(entry: CliEntry, strategy: Extract<InstallStrategy, { build: unknown }>): Promise<InstallOutcome> {
  const vars = templateVars(entry);
  const build = strategy.build as { repo: string; ref: string; run: string[] };
  const ref = interpolate(build.ref, vars);
  const work = mkdtempSync(join(tmpdir(), "bootstrap-clis-build-"));
  try {
    const clone = await runCommand(["git", "clone", "--depth", "1", "--branch", ref, build.repo, work]);
    if (clone.code !== 0) return { ok: false, detail: `clone of ${build.repo}@${ref} failed: ${clone.stderr.trim()}` };

    const built = await runCommand(build.run, work);
    if (built.code !== 0) return { ok: false, detail: `build failed: ${built.stderr.trim()}` };

    return { ok: true, detail: `built ${build.repo}@${ref}` };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function applyInstall(entry: CliEntry, strategy: InstallStrategy): Promise<InstallOutcome> {
  try {
    if ("download" in strategy) return await installDownload(entry, strategy);
    if ("run" in strategy) return await installRun(strategy);
    return await installBuild(entry, strategy);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
```

A checksum mismatch throws rather than returning `ok: false`, so it cannot be mistaken for a network failure; `applyInstall` converts it to a failed outcome carrying the mismatch detail.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/lib/install.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/install.ts scripts/lib/install.test.ts
git commit -m "Dodanie strategii instalacji z weryfikacja sum kontrolnych"
```

---

### Task 5: Orchestrator, statuses, and report

**Files:**
- Create: `scripts/lib/status.ts`
- Create: `scripts/lib/status.test.ts`
- Create: `scripts/bootstrap-clis.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1–4
- Produces: `type Status`, `decideAfterInstall(...)`, `formatReport(...)`, and the `node scripts/bootstrap-clis.ts [--check]` entry point

- [ ] **Step 1: Write the failing status tests**

The decision that follows an install is the part worth testing in isolation. Create `scripts/lib/status.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { decideAfterInstall, formatReport, type Outcome } from "./status.ts";

test("reports installed when a previously missing CLI now probes ok", () => {
  const status = decideAfterInstall("missing", { status: "ok", version: "1.10.0" }, true);
  assert.equal(status, "INSTALLED");
});

test("reports updated when a previously outdated CLI now probes ok", () => {
  const status = decideAfterInstall("outdated", { status: "ok", version: "1.10.0" }, true);
  assert.equal(status, "UPDATED");
});

test("reports needs-path when the binary was placed but still does not probe", () => {
  const status = decideAfterInstall("missing", { status: "missing" }, true);
  assert.equal(status, "NEEDS_PATH");
});

test("reports failed when nothing was placed and it still does not probe", () => {
  const status = decideAfterInstall("missing", { status: "missing" }, false);
  assert.equal(status, "FAILED");
});

test("reports failed when the reinstall still does not satisfy the minimum", () => {
  const status = decideAfterInstall("outdated", { status: "outdated", version: "1.9.0" }, true);
  assert.equal(status, "FAILED");
});

test("formatReport lists one line per entry and flags the not-ok ones", () => {
  const outcomes: Outcome[] = [
    { id: "linear", status: "INSTALLED", detail: "checksum verified" },
    { id: "gh", status: "NEEDS_AUTH", detail: "Run `gh auth login`" },
  ];
  const text = formatReport(outcomes);
  assert.match(text, /linear/);
  assert.match(text, /INSTALLED/);
  assert.match(text, /gh/);
  assert.match(text, /NEEDS_AUTH/);
});

test("formatReport marks an all-ok run", () => {
  const text = formatReport([{ id: "git", status: "OK", detail: "2.55.0" }]);
  assert.match(text, /OK/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/lib/status.test.ts`
Expected: FAIL — cannot resolve `./status.ts`

- [ ] **Step 3: Implement status.ts**

Create `scripts/lib/status.ts`:

```typescript
import type { ProbeResult } from "./probe.ts";

export type Status =
  | "OK"
  | "INSTALLED"
  | "UPDATED"
  | "FAILED"
  | "NEEDS_PATH"
  | "NEEDS_AUTH"
  | "UNKNOWN"
  | "UNSUPPORTED"
  | "MISSING"
  | "OUTDATED";

export interface Outcome {
  id: string;
  status: Status;
  detail: string;
}

export const SATISFIED: readonly Status[] = ["OK", "INSTALLED", "UPDATED"];

export function decideAfterInstall(before: "missing" | "outdated", after: ProbeResult, placed: boolean): Status {
  if (after.status === "ok") return before === "missing" ? "INSTALLED" : "UPDATED";
  if (placed) return after.status === "missing" ? "NEEDS_PATH" : "FAILED";
  return "FAILED";
}

export function formatReport(outcomes: Outcome[]): string {
  const width = Math.max(...outcomes.map((outcome) => outcome.id.length));
  const lines = outcomes.map((outcome) => {
    const marker = SATISFIED.includes(outcome.status) ? " " : "!";
    return `${marker} ${outcome.id.padEnd(width)}  ${outcome.status.padEnd(11)}  ${outcome.detail}`;
  });
  const failing = outcomes.filter((outcome) => !SATISFIED.includes(outcome.status));
  const summary = failing.length === 0
    ? `all ${outcomes.length} entries satisfied`
    : `${failing.length} of ${outcomes.length} entries need attention`;
  return [...lines, "", summary].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/lib/status.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Implement the orchestrator**

Create `scripts/bootstrap-clis.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CliContract, CliEntry } from "./types/cli-dependencies.ts";
import { applyInstall, installDir } from "./lib/install.ts";
import { platformKey } from "./lib/platform.ts";
import { probe, runCommand } from "./lib/probe.ts";
import { SATISFIED, decideAfterInstall, formatReport, type Outcome, type Status } from "./lib/status.ts";

const checkOnly = process.argv.includes("--check");
const here = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(readFileSync(join(here, "..", "cli-dependencies.json"), "utf8")) as CliContract;
const key = platformKey(process.platform, process.arch);

async function withAuth(entry: CliEntry, status: Status, detail: string): Promise<Outcome> {
  if (!SATISFIED.includes(status) || !entry.auth) return { id: entry.id, status, detail };
  const result = await runCommand(entry.auth.check);
  return result.code === 0
    ? { id: entry.id, status, detail }
    : { id: entry.id, status: "NEEDS_AUTH", detail: entry.auth.instructions };
}

async function reconcileEntry(entry: CliEntry): Promise<Outcome> {
  const first = await probe(entry);

  if (first.status === "ok") return withAuth(entry, "OK", first.version);
  if (first.status === "unknown") return { id: entry.id, status: "UNKNOWN", detail: first.output };

  const fallback = entry.manualInstall ?? "no install path declared";
  const strategy = key && entry.install ? entry.install[key] : undefined;

  if (!strategy) {
    const status: Status = entry.install ? "UNSUPPORTED" : first.status === "missing" ? "MISSING" : "OUTDATED";
    return { id: entry.id, status, detail: fallback };
  }
  if (checkOnly) {
    return { id: entry.id, status: first.status === "missing" ? "MISSING" : "OUTDATED", detail: "install skipped (--check)" };
  }

  const outcome = await applyInstall(entry, strategy);
  const placed = Boolean(outcome.placedAt) && existsSync(outcome.placedAt as string);
  const second = await probe(entry);
  const status = decideAfterInstall(first.status, second, placed);

  const detail = status === "NEEDS_PATH"
    ? `placed at ${outcome.placedAt}; add ${installDir()} to PATH`
    : outcome.ok ? outcome.detail : `${outcome.detail} (${fallback})`;

  return withAuth(entry, status, detail);
}

const outcomes: Outcome[] = [];
for (const entry of contract.clis) {
  outcomes.push(await reconcileEntry(entry));
}

console.log(formatReport(outcomes));
process.exit(outcomes.every((outcome) => SATISFIED.includes(outcome.status)) ? 0 : 1);
```

Entries are processed sequentially so the report reads top to bottom in contract order and two installers never write to `~/.local/bin` at once.

- [ ] **Step 6: Run the full test suite**

Run: `node --test scripts/types/cli-dependencies.test.ts scripts/lib/version.test.ts scripts/lib/platform.test.ts scripts/lib/probe.test.ts scripts/lib/install.test.ts scripts/lib/status.test.ts`
Expected: PASS, 36 tests

- [ ] **Step 7: Run the script in check mode**

Run: `node scripts/bootstrap-clis.ts --check`
Expected: exit code 1, with `linear` reported `MISSING` and `git`, `node`, `gh`, `rg` reported `OK` or `NEEDS_AUTH`. Nothing is installed.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/status.ts scripts/lib/status.test.ts scripts/bootstrap-clis.ts
git commit -m "Dodanie orkiestratora bootstrapu z trybem --check"
```

---

### Task 6: The skill and the acceptance run

**Files:**
- Create: `skills/bootstrap-clis/SKILL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `node scripts/bootstrap-clis.ts [--check]`
- Produces: the `/nerd4rent:bootstrap-clis` entry point

- [ ] **Step 1: Write the skill**

Create `skills/bootstrap-clis/SKILL.md`:

```markdown
---
name: bootstrap-clis
description: Bring this machine to the CLI state the skills in this repo require - probe every entry in cli-dependencies.json, install or update what is missing or outdated, and hand back the authentication steps only a human can complete. Use for `/nerd4rent:bootstrap-clis`, on a freshly set up machine, or when a skill fails because a command like `linear`, `gh`, or `rg` is missing or too old.
---

# Bootstrap CLIs

`cli-dependencies.json` at the repo root declares which CLIs the skills here
require. `scripts/bootstrap-clis.ts` reconciles this machine against it.

## Steps

1. Report the current state before changing anything:

   ```
   node scripts/bootstrap-clis.ts --check
   ```

   Exit code 0 means the machine is ready; stop and say so.

2. Reconcile:

   ```
   node scripts/bootstrap-clis.ts
   ```

3. Read the report and act on each status:

   | Status | What it means | What to do |
   |---|---|---|
   | `OK` / `INSTALLED` / `UPDATED` | Satisfied | Nothing |
   | `NEEDS_AUTH` | Installed, not authenticated | Give the user the printed command; do not run it for them |
   | `NEEDS_PATH` | Binary placed, not resolvable | Tell the user to add `~/.local/bin` to PATH, then re-run |
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
validator rejects anything else. Run `node scripts/validate-cli-dependencies.ts`
after editing the contract.
```

- [ ] **Step 2: Verify the skill file is well-formed**

Run: `node scripts/validate-cli-dependencies.ts`
Expected: `OK: 5 CLI entries validated` — confirming `bootstrap-clis` did not break the contract's `requiredBy` checks.

- [ ] **Step 3: Run the real acceptance test**

Run: `node scripts/bootstrap-clis.ts`
Expected: `linear` transitions to `INSTALLED` with `checksum verified`, then either `OK` or `NEEDS_AUTH`.

Confirm the binary directly:

```bash
linear --version
```

Expected: `linear version 1.10.0` or newer.

- [ ] **Step 4: Prove idempotence**

Run: `node scripts/bootstrap-clis.ts --check`
Expected: every entry `OK` (or `NEEDS_AUTH` until the user authenticates), nothing installed, and exit code 0 once authentication is done.

- [ ] **Step 5: Add the skill to the README skill list**

Modify `README.md`: add a row for `bootstrap-clis` matching the format of the existing skill entries.

- [ ] **Step 6: Commit**

```bash
git add skills/bootstrap-clis/SKILL.md README.md
git commit -m "Dodanie skilla bootstrap-clis jako punktu wejscia"
```

---

## Out of scope

Rewriting the Linear skills for joa23's command syntax — 25 call sites across 8 files — is separate work tracked in the spec's "Consequences and follow-up work" section. This plan installs the CLI; it does not migrate its callers. Expect the Linear skills to keep using schpet's syntax until that work happens.
