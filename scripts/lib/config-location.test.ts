import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { REPO_CONFIG_FILE, projectConfigLocation } from "./config-location.ts";

function fixture(): { root: string; repo: string; configDir: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), "nerdway-location-"));
  const repo = join(root, "repo");
  const configDir = join(root, "config");
  mkdirSync(repo);
  writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
  return { root, repo, configDir, env: { NERDWAY_CONFIG_DIR: configDir } };
}

test("the project config defaults to the user strategy under the config dir", () => {
  const { root, repo, configDir, env } = fixture();
  try {
    assert.deepEqual(projectConfigLocation(repo, env, { home: root }), {
      strategy: "user",
      path: join(configDir, "demo", "config.yml"),
      configDir,
      slug: "demo",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a config file inside the repo selects the repo strategy by its presence", () => {
  const { root, repo, configDir, env } = fixture();
  try {
    mkdirSync(join(repo, ".nerdway"));
    writeFileSync(join(repo, REPO_CONFIG_FILE), "tracker: github\n");
    assert.deepEqual(projectConfigLocation(repo, env, { home: root }), {
      strategy: "repo",
      path: join(repo, ".nerdway", "config.yml"),
      configDir,
      slug: "demo",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory named like the repo file does not count as the repo strategy", () => {
  const { root, repo, env } = fixture();
  try {
    mkdirSync(join(repo, REPO_CONFIG_FILE), { recursive: true });
    assert.equal(projectConfigLocation(repo, env, { home: root }).strategy, "user");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
