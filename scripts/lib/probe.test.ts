import { test } from "node:test";
import assert from "node:assert/strict";

import { probe, runCommand } from "./probe.ts";
import type { CliEntry } from "../types/cli-dependencies.ts";

function nodeEntry(overrides: Partial<CliEntry> = {}): CliEntry {
  return {
    id: "node",
    minVersion: "24.0.0",
    versionCommand: ["node", "--version"],
    versionRegex: "v(\\d+\\.\\d+\\.\\d+)",
    requiredBy: ["linear-issue-workflow"],
    ...overrides,
  };
}

test("runCommand captures stdout and exit code", async () => {
  const result = await runCommand(["node", "--version"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^v\d+\.\d+\.\d+/);
});

test("runCommand reports a null code for a binary that does not exist", async () => {
  const result = await runCommand(["definitely-not-a-real-binary-xyz"]);
  assert.equal(result.code, null);
});

test("probe reports ok for an installed CLI meeting the minimum", async () => {
  const result = await probe(nodeEntry());
  assert.equal(result.status, "ok");
});

test("probe reports outdated when the minimum is above the installed version", async () => {
  const result = await probe(nodeEntry({ minVersion: "999.0.0" }));
  assert.equal(result.status, "outdated");
  assert.match((result as { version: string }).version, /^\d+\.\d+\.\d+$/);
});

test("probe reports missing for an absent binary", async () => {
  const entry = nodeEntry({ versionCommand: ["definitely-not-a-real-binary-xyz", "--version"] });
  assert.equal((await probe(entry)).status, "missing");
});

test("probe reports unknown when the regex does not match the output", async () => {
  const result = await probe(nodeEntry({ versionRegex: "totally unmatched (\\d+)" }));
  assert.equal(result.status, "unknown");
});
