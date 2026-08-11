import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTemplates } from "./templates.ts";
import type { GraphContract } from "./workflow-graph.ts";

function entry(id: string, title: string) {
  return {
    id,
    description: `what ${id} carries`,
    schema: {
      type: "object",
      title,
      properties: {
        objective: { type: "string", title: "Objective", description: "the outcome we want" },
        notes: { type: "array", title: "Notes", description: "anything else worth writing down", items: { type: "string" } },
      },
      required: ["objective"],
    },
  };
}

const contract = {
  schemas: [
    entry("IssueSpec", "Issue spec"),
    entry("ImplementationPlan", "Implementation plan"),
    entry("SessionSummary", "Session summary"),
  ],
  nodes: [],
} as unknown as GraphContract;

test("builds one file per skill template, at the path the skill reads it from", () => {
  assert.deepEqual(
    buildTemplates(contract).map((template) => template.path),
    [
      "skills/linear-issue-workflow/plan-template.md",
      "skills/linear-issue-writer/issue-template.md",
      "skills/linear-issue-workflow/session-summary-template.md",
    ],
  );
});

test("every generated file opens with the banner that points back at the contract", () => {
  for (const template of buildTemplates(contract)) {
    assert.match(template.content, /^<!-- GENERATED from the schema registry in workflow-graph\.json\./);
    assert.match(template.content, /node scripts\/render-templates\.ts/);
  }
});

test("the issue template carries all three variants, and only FULL keeps the optional sections", () => {
  const issue = buildTemplates(contract).find((template) => template.path.endsWith("issue-template.md"));
  const content = issue?.content ?? "";

  assert.ok(content.includes("## FULL variant (complex issues)"));
  assert.ok(content.includes("## MINIMAL variant (small, clear tasks)"));
  assert.ok(content.includes("## CHILD sub-issue (when splitting into stages)"));
  assert.equal(content.split("### Objective").length - 1, 3);
  assert.equal(content.split("### Notes").length - 1, 1);
  assert.ok(content.trimEnd().endsWith("--parent <PARENT-ID>`, not in the body. -->"));
});

test("a template whose schema is missing from the registry fails loudly", () => {
  const withoutPlan = { ...contract, schemas: contract.schemas.filter((entry) => entry.id !== "ImplementationPlan") };
  assert.throws(() => buildTemplates(withoutPlan), /ImplementationPlan/);
});
