import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXED_SEGMENT = "5-" + "wiki";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("no skill file names a fixed wiki subfolder: paths are relative to the resolved wiki directory", () => {
  const offenders = files(join(repoRoot, "skills"))
    .filter((path) => readFileSync(path, "utf8").includes(FIXED_SEGMENT))
    .map((path) => relative(repoRoot, path));
  assert.deepEqual(offenders, []);
});

test("the hook, the vault adapters and the contract name no fixed wiki subfolder either", () => {
  const paths = ["hooks/session-start.ts", "adapters/vault/file.md", "adapters/vault/mcp.md", "workflow-graph.json", "CONTEXT.md"];
  const offenders = paths.filter((path) => readFileSync(join(repoRoot, path), "utf8").includes(FIXED_SEGMENT));
  assert.deepEqual(offenders, []);
});
