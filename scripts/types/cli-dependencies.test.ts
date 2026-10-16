import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateContract } from "./cli-dependencies.ts";

const skillDirs = ["issue-workflow", "nerdbrain-search"];

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "linear",
    minVersion: "1.10.0",
    versionCommand: ["linear", "--version"],
    versionRegex: "linear version (\\d+\\.\\d+\\.\\d+)",
    requiredBy: ["issue-workflow"],
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

test("accepts a requiredBy naming a hook path from the allowed list", () => {
  const errors = validateContract(
    { clis: [entry({ requiredBy: ["hooks/deny-vault-mcp.ts"] })] },
    skillDirs,
    ["hooks/deny-vault-mcp.ts"],
  );
  assert.deepEqual(errors, []);
});

test("rejects a hook path outside the allowed list and names both kinds of reference", () => {
  const errors = validateContract(
    { clis: [entry({ requiredBy: ["hooks/other.ts"] })] },
    skillDirs,
    ["hooks/deny-vault-mcp.ts"],
  );
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("hooks/other.ts"));
  assert.ok(errors[0].includes("directory under skills/"));
  assert.ok(errors[0].includes("allowed hook path"));
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

test("accepts an entry installed via npm", () => {
  assert.deepEqual(validateContract({ clis: [entry({ npm: "linearis" })] }, skillDirs), []);
});

test("rejects an empty npm package name", () => {
  const errors = validateContract({ clis: [entry({ npm: "" })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /npm/);
});

test("rejects an entry declaring both npm and install", () => {
  const install = { "linux-x64": { download: "https://example.test/a.tar.gz", binary: "a" } };
  const errors = validateContract({ clis: [entry({ npm: "linearis", install })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /npm or install/);
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

test("the node entry keeps 24.0.0 and names both cursor hooks", () => {
  const contract = JSON.parse(readFileSync(new URL("../../cli-dependencies.json", import.meta.url), "utf8")) as {
    clis: Array<{ id: string; minVersion: string; requiredBy: string[] }>;
  };
  const node = contract.clis.find((item) => item.id === "node");
  assert.ok(node);
  assert.equal(node.minVersion, "24.0.0");
  assert.equal(node.requiredBy.includes("hooks/deny-vault-mcp.ts"), true);
  assert.equal(node.requiredBy.includes("hooks/session-start.ts"), true);
});

test("rejects a malformed versionRegex", () => {
  const errors = validateContract({ clis: [entry({ versionRegex: "linear version (" })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /versionRegex/);
});
