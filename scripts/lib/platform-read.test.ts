import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { pluginVocabulary, readPlatformFile, trackerAdapterSources } from "./platform-read.ts";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = mkdtempSync(join(tmpdir(), "platform-read-"));

test("pluginVocabulary reads the PlatformConfig enums from workflow-graph.json", () => {
  const vocabulary = pluginVocabulary(pluginRoot);
  assert.ok(vocabulary.trackers.includes("linear"));
  assert.ok(vocabulary.trackers.includes("none"));
  assert.ok(vocabulary.vcs.includes("github"));
  assert.ok(vocabulary.phases.includes("in-progress"));
});

test("trackerAdapterSources loads every tracker adapter by name", () => {
  assert.deepEqual([...trackerAdapterSources(pluginRoot).keys()], ["ado", "github", "gitlab", "linear"]);
});

test("readPlatformFile reads this repo's CLAUDE.md and reports a missing file as absent", () => {
  const read = readPlatformFile(pluginRoot, join(pluginRoot, "CLAUDE.md"));
  assert.equal(read.status, "found");
  assert.equal(read.status === "found" ? read.value.tracker : undefined, "linear");
  assert.equal(readPlatformFile(pluginRoot, join(dir, "missing.md")).status, "absent");
});

test("readPlatformFile reports a broken section as invalid", () => {
  const path = join(dir, "broken.md");
  writeFileSync(path, "## Platform\n\n```yaml\ntracker: jira\nvcs: github\n```\n");
  assert.equal(readPlatformFile(pluginRoot, path).status, "invalid");
});
