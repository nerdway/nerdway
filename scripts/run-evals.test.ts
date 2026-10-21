import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, sep } from "node:path";

const RUNNER = join(import.meta.dirname, "run-evals.ts");
const ROOT = join(import.meta.dirname, "..");

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function run(args: string[]) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { encoding: "utf8", cwd: ROOT });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("--dry-run writes the cases of the chosen skill and prints the claude command without running it", () => {
  const { status, stdout } = run(["--skill", "issue-close", "--dry-run", "--runs", "1", "--no-publish"]);
  assert.equal(status, 0);
  const dir = /written to (eval-cases\/[^/\s]+)\//.exec(stdout)?.[1];
  assert.ok(dir, stdout);
  try {
    assert.deepEqual(readdirSync(join(ROOT, dir)), ["issue-close"]);
    assert.ok(existsSync(join(ROOT, dir, "issue-close", "gate-stops-without-guide", "prompt.md")));
    const results = escapeRegExp(join(ROOT, "results") + sep);
    assert.match(stdout, new RegExp(`claude plugin eval ${escapeRegExp(ROOT)} --eval-dir ${escapeRegExp(dir)} --output-dir ${results}\\S+ --runs 1 --no-publish`));
  } finally {
    rmSync(join(ROOT, dir), { recursive: true, force: true });
  }
});

test("an unknown skill stops before anything is written", () => {
  const { status, stderr } = run(["--skill", "no-such-skill", "--dry-run"]);
  assert.equal(status, 2);
  assert.match(stderr, /no-such-skill/);
});

test("a Bash grant is refused with the usage", () => {
  const { status, stderr } = run(["--allow-tools", "Bash", "--dry-run"]);
  assert.equal(status, 2);
  assert.match(stderr, /Bash or MCP/);
  assert.match(stderr, /usage:/);
});
