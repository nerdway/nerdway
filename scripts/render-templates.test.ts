import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSchema } from "./types/render-schema.ts";
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

const bodyOf = (id: string) => contract.schemas.find((entry) => entry.id === id)?.schema;

test("a partially filled instance of the real IssueSpec writes no placeholder junk into the comment", () => {
  const rendered = renderSchema(bodyOf("IssueSpec"), {
    objective: "Typed edge state",
    acceptanceCriteria: ["the validator rejects an entry with no body"],
  });
  assert.ok(!rendered.includes("undefined"), rendered);
  assert.ok(!rendered.includes("### Problem & context"), "a section with nothing to say should not be rendered");
  assert.ok(rendered.includes("- [ ] the validator rejects an entry with no body"));
});

test("the real ReviewFindings schema keeps its table intact when a finding carries a pipe and a newline", () => {
  const rendered = renderSchema(bodyOf("ReviewFindings"), {
    summary: "one finding survived verification",
    findings: [
      {
        file: "scripts/types/render-schema.ts",
        line: 61,
        claim: "a cell holding `a | b` splits the row",
        evidence: "line1\nline2",
        severity: "major",
        confidence: "high",
      },
    ],
  });
  const rows = rendered.split("\n").filter((line) => line.startsWith("|"));
  assert.equal(rows.length, 3, "header, separator and exactly one data row");
  assert.equal(
    rows[2],
    "| scripts/types/render-schema.ts | 61 | a cell holding `a \\| b` splits the row | line1<br>line2 | major | high |",
  );
});
