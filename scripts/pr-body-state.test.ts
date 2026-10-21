import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const RUNNER = join(import.meta.dirname, "pr-body-state.ts");

function run(input: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { input, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

test("prints draft for the start draft read from gh pr view --json", () => {
  const { status, stdout } = run(JSON.stringify({ body: "Fixes DEMO-1\n\nAdds the thing.", title: "DEMO-1: thing" }));
  assert.equal(status, 0);
  assert.equal(stdout, "draft\n");
});

test("prints readiness for a description with the marker", () => {
  const { status, stdout } = run("Fixes DEMO-1\n\nWhy.\n\nWhat.\n\n<!-- nerd4rent:pr-body -->\n");
  assert.equal(status, 0);
  assert.equal(stdout, "readiness\n");
});

test("prints manual for a description changed by hand", () => {
  const { status, stdout } = run(JSON.stringify({ description: "Fixes #4\n\nOne.\n\nTwo." }));
  assert.equal(status, 0);
  assert.equal(stdout, "manual\n");
});

test("rejects arguments with the usage line", () => {
  const { status, stdout } = run("Fixes DEMO-1", ["--json"]);
  assert.equal(status, 2);
  assert.equal(stdout, "");
});
