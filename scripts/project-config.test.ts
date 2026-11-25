import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("move prints before and after, and refuses with exit 4 instead of overwriting", () => {
  const { root, repo, configDir } = fixture();
  try {
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
    writeFileSync(join(configDir, "demo", "config.yml"), "tracker: none\n");
    assert.equal(run(["move", "--to", "user", repo], configDir).status, 4);
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

test("move --to repo with no config yet creates the repo-located file", () => {
  const { root, repo, configDir } = fixture();
  try {
    const created = run(["move", "--to", "repo", repo], configDir);
    assert.equal(created.status, 0, created.stderr);
    assert.deepEqual(JSON.parse(created.stdout), { status: "created", strategy: "repo", path: join(repo, ".nerdway", "config.yml") });
    assert.equal(JSON.parse(run(["where", repo], configDir).stdout).strategy, "repo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("set wiki.path edits only that key, keeps comments and other keys, and prints before and after", () => {
  const { root, repo, configDir } = fixture();
  try {
    mkdirSync(configDir, { recursive: true });
    const original = "# my defaults\nwiki:\n  path: ~/vault # old\npr:\n  collapse_details: true\n";
    writeFileSync(join(configDir, "config.yml"), original);
    const result = run(["set", "wiki.path", "~/vault/wiki", "--layer", "defaults", repo], configDir);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      status: "set",
      key: "wiki.path",
      layer: "defaults",
      path: join(configDir, "config.yml"),
      before: "~/vault",
      after: "~/vault/wiki",
    });
    const text = readFileSync(join(configDir, "config.yml"), "utf8");
    assert.match(text, /# my defaults/);
    assert.match(text, /path: ~\/vault\/wiki/);
    assert.match(text, /collapse_details: true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("set needs a layer and a value", () => {
  const { root, repo, configDir } = fixture();
  try {
    assert.equal(run(["set", "wiki.path", "~/w", repo], configDir).status, 2);
    assert.equal(run(["set", "tracker", "github", "--layer", "project", repo], configDir).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
