import { test } from "node:test";
import assert from "node:assert/strict";

import { validateContract } from "./cli-dependencies.ts";

const skillDirs = ["linear-issue-workflow", "nerdbrain-search"];

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "linear",
    minVersion: "1.10.0",
    versionCommand: ["linear", "--version"],
    versionRegex: "linear version (\\d+\\.\\d+\\.\\d+)",
    requiredBy: ["linear-issue-workflow"],
    ...overrides,
  };
}

test("accepts a minimal valid contract", () => {
  assert.deepEqual(validateContract({ clis: [entry()] }, skillDirs), []);
});

test("rejects a requiredBy naming no existing skill directory", () => {
  const errors = validateContract({ clis: [entry({ requiredBy: ["ghost-skill"] })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost-skill/);
});

test("rejects an empty requiredBy", () => {
  const errors = validateContract({ clis: [entry({ requiredBy: [] })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /requiredBy/);
});

test("rejects a minVersion that is not three numeric segments", () => {
  const errors = validateContract({ clis: [entry({ minVersion: "1.10" })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /minVersion/);
});

test("rejects an unknown platform key", () => {
  const install = { "win32-riscv": { download: "https://example.test/a.tar.gz", binary: "a" } };
  const errors = validateContract({ clis: [entry({ install })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /win32-riscv/);
});

test("rejects a download strategy missing binary", () => {
  const install = { "linux-x64": { download: "https://example.test/a.tar.gz" } };
  const errors = validateContract({ clis: [entry({ install })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /binary/);
});

test("rejects a duplicate id", () => {
  const errors = validateContract({ clis: [entry(), entry()] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate/i);
});

test("reports every problem rather than stopping at the first", () => {
  const bad = entry({ requiredBy: [], minVersion: "x" });
  assert.equal(validateContract({ clis: [bad] }, skillDirs).length, 2);
});

test("rejects a non-object payload", () => {
  assert.equal(validateContract(null, skillDirs).length, 1);
});

test("rejects a malformed versionRegex", () => {
  const errors = validateContract({ clis: [entry({ versionRegex: "linear version (" })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /versionRegex/);
});
