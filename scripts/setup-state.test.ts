import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "setup-state.ts");

function run(args: string[], configDir: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NERDWAY_CONFIG_DIR: configDir, NERDWAY_MACHINE: "workstation" };
  delete env.NERDWAY_WIKI;
  delete env.NERDBRAIN_VAULT;
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
}

function withRepo(body: (repo: string, configDir: string) => void): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "nerdway-setup-cli-")));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
    body(repo, join(root, "config"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the full state lists every core check with a status", () => {
  withRepo((repo, configDir) => {
    const result = run([repo], configDir);
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(result.stdout);
    assert.equal(state.inRepo, true);
    assert.ok(state.checks.length > 0);
    for (const check of state.checks) assert.match(check.status, /^(ok|warn|missing|unknown)$/);
  });
});

test("--preflight needs --caller and reports the caller and an outcome", () => {
  withRepo((repo, configDir) => {
    assert.equal(run(["--preflight", repo], configDir).status, 2);
    const result = run(["--preflight", "--caller", "issue-writer", repo], configDir);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.caller, "issue-writer");
    assert.equal(summary.status, "incomplete");
    assert.equal(summary.projectConfig.strategy, "user");
  });
});

test("--check runs one check by id and rejects an unknown id", () => {
  withRepo((repo, configDir) => {
    const state = JSON.parse(run([repo], configDir).stdout);
    const first = state.checks[0];
    const one = run(["--check", first.id, repo], configDir);
    assert.equal(one.status, 0, one.stderr);
    assert.equal(JSON.parse(one.stdout).id, first.id);
    assert.equal(run(["--check", "no-such-check", repo], configDir).status, 2);
  });
});
