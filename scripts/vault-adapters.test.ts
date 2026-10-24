import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sectionBody, tableRows } from "./types/workflow-graph.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const SKILLS = ["skills/nerdbrain-wiki/SKILL.md", "skills/nerdbrain-search/SKILL.md"];
const FILE_ADAPTER = "adapters/vault/file.md";

const VAULT_OPERATIONS = [
  "page.read",
  "page.read-section",
  "page.replace-section",
  "page.append-section",
  "page.prepend-capped",
  "page.create",
  "page.bump-updated",
  "vault.search",
  "index.append",
  "log.append",
  "graph.links",
  "graph.backlinks",
  "graph.hop1",
];

const INLINE_TRANSPORT_RECIPE = /^\s*rg |Edit \$PAGE|Write \$PAGE/;

function operationRows(adapter: string): string[][] {
  const table = sectionBody(read(adapter), "Operations");
  assert.ok(table !== undefined, `${adapter} needs a ## Operations section`);
  return tableRows(table);
}

for (const skill of SKILLS) {
  test(`${skill} quotes no transport recipe inline`, () => {
    const offenders = read(skill)
      .split("\n")
      .filter((line) => INLINE_TRANSPORT_RECIPE.test(line));
    assert.deepEqual(offenders, []);
  });

  test(`${skill} points at the vault adapters`, () => {
    assert.match(read(skill), /adapters\/vault/);
  });
}

test(`${FILE_ADAPTER} lists exactly the vault operations`, () => {
  assert.ok(existsSync(join(repoRoot, FILE_ADAPTER)));
  assert.deepEqual(operationRows(FILE_ADAPTER).map((row) => row[0]), VAULT_OPERATIONS);
});

test(`${FILE_ADAPTER} is the only vault adapter that runs rg`, () => {
  assert.match(read(FILE_ADAPTER), /\brg /);
});
