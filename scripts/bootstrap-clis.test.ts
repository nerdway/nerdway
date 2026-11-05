import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const SCRIPT = join(import.meta.dirname, "bootstrap-clis.ts");
const ROOT = join(import.meta.dirname, "..");

function run(args: string[]) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", cwd: ROOT });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function reportedIds(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => /^. (\S+)\s{2,}/.exec(line)?.[1])
    .filter((id): id is string => id !== undefined);
}

test("--check --only node reports only that entry", () => {
  const { stdout } = run(["--check", "--only", "node"]);
  assert.deepEqual(reportedIds(stdout), ["node"]);
  assert.match(stdout, /1 entries/);
});

test("--check --only rejects an unknown CLI id", () => {
  const { status, stderr } = run(["--check", "--only", "ghost-cli"]);
  assert.equal(status, 1);
  assert.match(stderr, /ghost-cli/);
});

test("--check --skills nerdbrain-search reports only rg", () => {
  const { stdout } = run(["--check", "--skills", "nerdbrain-search"]);
  assert.deepEqual(reportedIds(stdout), ["rg"]);
});
