import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { pluginVocabulary, readPlatformFile, trackerAdapterSources } from "./platform-read.ts";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("pluginVocabulary reads the PlatformConfig enums from workflow-graph.json", () => {
  const vocabulary = pluginVocabulary(pluginRoot);
  assert.ok(vocabulary.trackers.includes("linear"));
  assert.ok(vocabulary.trackers.includes("jira"));
  assert.ok(vocabulary.trackers.includes("none"));
  assert.ok(vocabulary.vcs.includes("github"));
  assert.ok(vocabulary.phases.includes("in-progress"));
});

test("trackerAdapterSources loads every tracker adapter by name", () => {
  assert.deepEqual([...trackerAdapterSources(pluginRoot).keys()], ["ado", "github", "gitlab", "jira", "linear"]);
});

test("readPlatformFile reads the user config and reports a missing store as absent", () => {
  const root = mkdtempSync(join(tmpdir(), "platform-read-file-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const env = { NERDWAY_CONFIG_DIR: join(root, "config") };
    assert.equal(readPlatformFile(pluginRoot, repo, env).status, "absent");
    mkdirSync(join(root, "config", "repo"), { recursive: true });
    writeFileSync(
      join(root, "config", "repo", "config.yml"),
      "tracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\n",
    );
    const read = readPlatformFile(pluginRoot, repo, env);
    assert.equal(read.status, "found");
    assert.equal(read.status === "found" ? read.value.tracker : undefined, "github");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readPlatformFile reports a broken project file as invalid", () => {
  const root = mkdtempSync(join(tmpdir(), "platform-read-broken-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    mkdirSync(join(root, "config", "repo"), { recursive: true });
    writeFileSync(join(root, "config", "repo", "config.yml"), "tracker: basecamp\nvcs: github\n");
    assert.equal(readPlatformFile(pluginRoot, repo, { NERDWAY_CONFIG_DIR: join(root, "config") }).status, "invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
