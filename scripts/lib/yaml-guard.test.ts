import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WRAPPER = "scripts/lib/yaml.ts";
const GUARD = "scripts/lib/yaml-guard.test.ts";

const vendorImport = new RegExp(String.raw`from\s+["'][^"']*${"vendor"}/${"yaml"}`);
const parseIdent = ["parse", "Yaml"].join("");
const emitIdent = ["emit", "Yaml"].join("");
const frontmatterSplit = new RegExp(String.raw`\^---\\r\?\\n`);
const yamlLine = ["YAML", "_LINE"].join("");

function trackedTypeScript(): string[] {
  return execFileSync("git", ["ls-files", "-z", "scripts", "hooks"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((path) => path.endsWith(".ts"));
}

test("no file outside the yaml wrapper imports the vendored library", () => {
  const offenders: string[] = [];
  for (const path of trackedTypeScript()) {
    if (path === WRAPPER) continue;
    const source = readFileSync(join(repoRoot, path), "utf8");
    if (vendorImport.test(source)) offenders.push(path);
  }
  assert.deepEqual(offenders, []);
});

test("no other file reimplements YAML parsing", () => {
  const offenders: string[] = [];
  for (const path of trackedTypeScript()) {
    if (path === WRAPPER || path === GUARD) continue;
    const source = readFileSync(join(repoRoot, path), "utf8");
    if (source.includes(parseIdent) || source.includes(emitIdent) || frontmatterSplit.test(source) || source.includes(yamlLine)) {
      offenders.push(path);
    }
  }
  assert.deepEqual(offenders, []);
});
