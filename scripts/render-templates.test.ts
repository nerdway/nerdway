import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTemplates } from "./types/templates.ts";
import type { GraphContract } from "./types/workflow-graph.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(join(repoRoot, "workflow-graph.json"), "utf8")) as GraphContract;

for (const template of buildTemplates(contract)) {
  test(`${template.path} is what the contract renders, not a hand-edited file`, () => {
    assert.equal(
      readFileSync(join(repoRoot, template.path), "utf8"),
      template.content,
      `${template.path} drifted from the schema registry — edit workflow-graph.json and run node scripts/render-templates.ts`,
    );
  });
}
