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

test("the FULL issue template opens with a Repository section that explains the `[repo=owner/name]` line", () => {
  const full = buildTemplates(contract)
    .find((template) => template.path === "skills/issue-writer/issue-template.md")
    ?.content.split("---")[0];
  assert.ok(full);
  assert.match(full, /## FULL variant \(complex issues\)/);
  const repositoryAt = full.indexOf("### Repository");
  const objectiveAt = full.indexOf("### Objective");
  assert.ok(repositoryAt !== -1 && objectiveAt !== -1 && repositoryAt < objectiveAt);
  assert.match(full, /\[repo=owner\/name\]/);
  assert.match(full, /never from the project description/);
});

test("MINIMAL and CHILD stay without it", () => {
  const source = buildTemplates(contract).find(
    (template) => template.path === "skills/issue-writer/issue-template.md",
  )?.content;
  assert.ok(source);
  const [, minimal, child] = source.split("---");
  assert.ok(minimal);
  assert.ok(child);
  assert.doesNotMatch(minimal, /### Repository/);
  assert.doesNotMatch(child, /### Repository/);
  assert.match(minimal, /## MINIMAL variant/);
  assert.match(child, /## CHILD sub-issue/);
});

test("an IssueSpec instance with repo renders the tag line verbatim", () => {
  const rendered = renderSchema(bodyOf("IssueSpec"), {
    repo: "[repo=acme/app]",
    objective: "Typed edge state",
    acceptanceCriteria: ["the validator rejects an entry with no body"],
  });
  assert.match(rendered, /^## Issue spec\n\n### Repository\n\n\[repo=acme\/app\]\n/m);
  assert.ok(rendered.includes("[repo=acme/app]"));
});

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
        axis: "correctness-regressions",
        file: "scripts/types/render-schema.ts",
        line: 61,
        claim: "a cell holding `a | b` splits the row",
        evidence: "line1\nline2",
        severity: "major",
        confidence: "high",
      },
    ],
    stats: { mapped: 1, verified: 1, rejected: 0, unverifiedOverflow: 0, overruled: 0 },
    conflicts: [],
  });
  const findingsSection = rendered.split("### Findings")[1].split("###")[0];
  const rows = findingsSection.split("\n").filter((line) => line.startsWith("|"));
  assert.equal(rows.length, 3, "header, separator and exactly one data row");
  assert.equal(
    rows[2],
    "| correctness-regressions | scripts/types/render-schema.ts | 61 | a cell holding `a \\| b` splits the row | line1<br>line2 | major | high |",
  );
});
