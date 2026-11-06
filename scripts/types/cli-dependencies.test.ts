import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBootstrapArgs, resolveCliSubset, validateContract } from "./cli-dependencies.ts";

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
    { clis: [entry({ requiredBy: ["hooks/require-issue.ts"] })] },
    skillDirs,
    ["hooks/require-issue.ts"],
  );
  assert.deepEqual(errors, []);
});

test("rejects a hook path outside the allowed list and names both kinds of reference", () => {
  const errors = validateContract(
    { clis: [entry({ requiredBy: ["hooks/other.ts"] })] },
    skillDirs,
    ["hooks/require-issue.ts"],
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
  assert.equal(node.requiredBy.includes("hooks/require-issue.ts"), true);
  assert.equal(node.requiredBy.includes("hooks/session-start.ts"), true);
});

test("the acli entry is the Jira Cloud tracker CLI with API-token auth", () => {
  const contract = JSON.parse(readFileSync(new URL("../../cli-dependencies.json", import.meta.url), "utf8")) as {
    clis: Array<{
      id: string;
      minVersion: string;
      versionCommand: string[];
      requiredBy: string[];
      auth?: { check: string[]; instructions: string };
    }>;
  };
  const acli = contract.clis.find((item) => item.id === "acli");
  assert.ok(acli);
  assert.equal(acli.minVersion, "1.3.0");
  assert.deepEqual(acli.versionCommand, ["acli", "--version"]);
  assert.equal(acli.requiredBy.includes("determine-platform"), true);
  assert.equal(acli.requiredBy.includes("issue-workflow"), true);
  assert.ok(acli.auth);
  assert.deepEqual(acli.auth.check, ["acli", "jira", "project", "list", "--limit", "1"]);
  assert.match(acli.auth.instructions, /--token/);
  assert.match(acli.auth.instructions, /Do not use `acli jira auth login --web`/);
});

test("rejects a malformed versionRegex", () => {
  const errors = validateContract({ clis: [entry({ versionRegex: "linear version (" })] }, skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /versionRegex/);
});

test("resolveCliSubset keeps entries whose requiredBy intersects the skill set", () => {
  const gh = entry({ id: "gh", requiredBy: ["issue-writer", "issue-workflow"] });
  const rg = entry({ id: "rg", requiredBy: ["nerdbrain-search"] });
  const result = resolveCliSubset({ clis: [gh, rg] }, { mode: "skills", names: ["issue-writer"] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries.map((item) => item.id), ["gh"]);
});

test("resolveCliSubset keeps only the named ids in contract order", () => {
  const node = entry({ id: "node" });
  const gh = entry({ id: "gh" });
  const rg = entry({ id: "rg" });
  const result = resolveCliSubset({ clis: [node, gh, rg] }, { mode: "only", ids: ["rg", "node"] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries.map((item) => item.id), ["node", "rg"]);
});

test("resolveCliSubset names unknown --only ids instead of dropping them", () => {
  const result = resolveCliSubset({ clis: [entry({ id: "node" })] }, { mode: "only", ids: ["node", "ghost"] });
  assert.equal(result.entries.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /ghost/);
});

test("parseBootstrapArgs reads --check and comma-separated --only ids", () => {
  const parsed = parseBootstrapArgs(["--check", "--only", "rg,node"]);
  assert.deepEqual(parsed, { ok: true, check: true, filter: { mode: "only", ids: ["rg", "node"] } });
});

test("parseBootstrapArgs collects repeatable --skills names", () => {
  const parsed = parseBootstrapArgs(["--skills", "issue-writer", "--skills", "nerdbrain-search"]);
  assert.deepEqual(parsed, {
    ok: true,
    check: false,
    filter: { mode: "skills", names: ["issue-writer", "nerdbrain-search"] },
  });
});

test("parseBootstrapArgs treats a bare invocation as the full set", () => {
  assert.deepEqual(parseBootstrapArgs([]), { ok: true, check: false, filter: { mode: "all" } });
});

test("parseBootstrapArgs rejects --all combined with a subset filter", () => {
  const parsed = parseBootstrapArgs(["--all", "--only", "node"]);
  assert.deepEqual(parsed, { ok: false, errors: ["--all cannot be combined with --only or --skills"] });
});

test("parseBootstrapArgs rejects --only combined with --skills", () => {
  const parsed = parseBootstrapArgs(["--only", "node", "--skills", "issue-writer"]);
  assert.deepEqual(parsed, { ok: false, errors: ["--only cannot be combined with --skills"] });
});

test("parseBootstrapArgs rejects --only without a value", () => {
  const parsed = parseBootstrapArgs(["--only"]);
  assert.ok(!parsed.ok);
  if (parsed.ok) return;
  assert.match(parsed.errors[0], /--only/);
});
