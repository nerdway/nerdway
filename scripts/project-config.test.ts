import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "project-config.ts");

function run(args: string[], configDir: string) {
  const env = { ...process.env, NERDWAY_CONFIG_DIR: configDir };
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
}

function fixture(): { root: string; repo: string; configDir: string } {
  const root = mkdtempSync(join(tmpdir(), "nerdway-project-config-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
  return { root, repo, configDir: join(root, "config") };
}

test("where reports the strategy, the path and whether the file exists", () => {
  const { root, repo, configDir } = fixture();
  try {
    const result = run(["where", repo], configDir);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { strategy: "user", path: join(configDir, "demo", "config.yml"), exists: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("move prints before and after, and refuses with exit 4 when there is nothing to move", () => {
  const { root, repo, configDir } = fixture();
  try {
    assert.equal(run(["move", "--to", "repo", repo], configDir).status, 4);
    mkdirSync(join(configDir, "demo"), { recursive: true });
    writeFileSync(join(configDir, "demo", "config.yml"), "tracker: none\n");
    const moved = run(["move", "--to", "repo", repo], configDir);
    assert.equal(moved.status, 0);
    assert.deepEqual(JSON.parse(moved.stdout), {
      status: "moved",
      strategy: "repo",
      before: join(configDir, "demo", "config.yml"),
      after: join(repo, ".nerdway", "config.yml"),
    });
    assert.equal(existsSync(join(repo, ".nerdway", "config.yml")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown command or target is a usage error", () => {
  const { root, repo, configDir } = fixture();
  try {
    assert.equal(run(["move", "--to", "elsewhere", repo], configDir).status, 2);
    assert.equal(run([], configDir).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
