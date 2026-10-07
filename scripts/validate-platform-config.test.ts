import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "validate-platform-config.ts");
const dir = mkdtempSync(join(tmpdir(), "platform-print-"));

function print(markdown: string | undefined) {
  const path = join(dir, `${Math.random().toString(36).slice(2)}.md`);
  if (markdown !== undefined) writeFileSync(path, markdown);
  return spawnSync(process.execPath, [script, "--print", path], { encoding: "utf8" });
}

test("--print: a valid section exits 0 with the config as JSON on stdout", () => {
  const run = print("# Repo\n\n## Platform\n\n```yaml\ntracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n```\n");
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { tracker: "github", vcs: "github", github: { owner: "acme", repo: "app" } });
});

test("--print: no file or no section exits 3, so the skill moves on to its next source", () => {
  assert.equal(print(undefined).status, 3);
  assert.equal(print("# Repo\n\nNo platform here.\n").status, 3);
});

test("--print: a broken section exits 4, never 1, which stays Node's own failure", () => {
  const run = print("## Platform\n\n```yaml\ntracker: jira\nvcs: github\n```\n");
  assert.equal(run.status, 4);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /jira/);
});
