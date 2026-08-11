import { test } from "node:test";
import assert from "node:assert/strict";

import { PLACEHOLDER, renderSchema } from "./render-schema.ts";

const objective = {
  type: "string",
  title: "Objective",
  description: "One paragraph: what problem we solve and for whom.",
};

const dependencies = {
  type: "array",
  title: "Dependencies",
  description: "Blocking issues and prerequisites outside this plan.",
  items: { type: "string" },
};

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", title: "Implementation plan", properties, required };
}

test("placeholder mode heads the document with the schema title and each property with its hint", () => {
  const expected = `## Implementation plan

### Objective

<!-- One paragraph: what problem we solve and for whom. -->
`;
  assert.equal(renderSchema(schema({ objective }), PLACEHOLDER), expected);
});

test("instance mode puts the value where the placeholder put the hint", () => {
  const expected = `## Implementation plan

### Objective

Every edge answers what travels through it.
`;
  const instance = { objective: "Every edge answers what travels through it." };
  assert.equal(renderSchema(schema({ objective }), instance), expected);
});

test("placeholder mode opens a list of strings with two empty bullets", () => {
  const expected = `## Implementation plan

### Dependencies

<!-- Blocking issues and prerequisites outside this plan. -->

-
-
`;
  assert.equal(renderSchema(schema({ dependencies }), PLACEHOLDER), expected);
});

test("instance mode renders one bullet per item", () => {
  const expected = `## Implementation plan

### Dependencies

- DEMO-245, merged as PR #17
- Node 24 with native type stripping
`;
  const instance = { dependencies: ["DEMO-245, merged as PR #17", "Node 24 with native type stripping"] };
  assert.equal(renderSchema(schema({ dependencies }), instance), expected);
});

test("x-render checklist opens checkbox items instead of bullets", () => {
  const criteria = {
    type: "array",
    title: "Acceptance Criteria",
    description: "Each item independently verifiable.",
    "x-render": "checklist",
    items: { type: "string" },
  };
  const expected = `## Implementation plan

### Acceptance Criteria

<!-- Each item independently verifiable. -->

- [ ]
- [ ]
`;
  assert.equal(renderSchema(schema({ criteria }), PLACEHOLDER), expected);
});

test("x-render numbered counts the items", () => {
  const steps = {
    type: "array",
    title: "Implementation Steps",
    description: "Ordered steps, each one an atomic commit.",
    "x-render": "numbered",
    items: { type: "string" },
  };
  const expected = `## Implementation plan

### Implementation Steps

1. Typy i reguły walidatora
2. Wypełnienie rejestru
`;
  assert.equal(renderSchema(schema({ steps }), { steps: ["Typy i reguły walidatora", "Wypełnienie rejestru"] }), expected);
});

test("an enum lists the values it accepts under the hint", () => {
  const reviewer = {
    type: "string",
    title: "Reviewer",
    description: "Which reviewer the user picked.",
    enum: ["superpowers", "matt-pocock", "manual"],
  };
  const expected = `## Implementation plan

### Reviewer

<!-- Which reviewer the user picked. -->

<!-- one of: superpowers | matt-pocock | manual -->
`;
  assert.equal(renderSchema(schema({ reviewer }), PLACEHOLDER), expected);
});

const scope = {
  type: "object",
  title: "Scope",
  description: "What this plan delivers and what it leaves out.",
  properties: {
    inScope: { type: "array", title: "In scope", description: "What this plan delivers.", items: { type: "string" } },
    outOfScope: {
      type: "array",
      title: "Out of scope",
      description: "What it leaves to another issue.",
      items: { type: "string" },
    },
  },
};

test("a nested object labels its members in bold instead of opening new sections", () => {
  const expected = `## Implementation plan

### Scope

<!-- What this plan delivers and what it leaves out. -->

**In scope:**

<!-- What this plan delivers. -->

-
-

**Out of scope:**

<!-- What it leaves to another issue. -->

-
-
`;
  assert.equal(renderSchema(schema({ scope }), PLACEHOLDER), expected);
});

test("a nested object fills its members from the instance", () => {
  const expected = `## Implementation plan

### Scope

**In scope:**

- Ciała schematów w rejestrze

**Out of scope:**

- Skrypty w workflows/
`;
  const instance = { scope: { inScope: ["Ciała schematów w rejestrze"], outOfScope: ["Skrypty w workflows/"] } };
  assert.equal(renderSchema(schema({ scope }), instance), expected);
});

const risks = {
  type: "array",
  title: "Risks",
  description: "One row per risk, each with its mitigation.",
  items: {
    type: "object",
    title: "Risk",
    description: "A risk and its mitigation.",
    properties: {
      risk: { type: "string", title: "Risk", description: "What could go wrong." },
      mitigation: { type: "string", title: "Mitigation", description: "What keeps it survivable." },
    },
  },
};

test("a list of objects becomes a table headed by the item titles", () => {
  const expected = `## Implementation plan

### Risks

<!-- One row per risk, each with its mitigation. -->

| Risk | Mitigation |
|------|------------|
| | |
`;
  assert.equal(renderSchema(schema({ risks }), PLACEHOLDER), expected);
});

test("instance mode gives the table one row per item", () => {
  const expected = `## Implementation plan

### Risks

| Risk | Mitigation |
|------|------------|
| Regresja czytelności szablonów | Krok 4 jest jawnie krokiem diffowania |
| Brak wsparcia $defs | Spłaszczenie jest mechaniczne |
`;
  const instance = {
    risks: [
      { risk: "Regresja czytelności szablonów", mitigation: "Krok 4 jest jawnie krokiem diffowania" },
      { risk: "Brak wsparcia $defs", mitigation: "Spłaszczenie jest mechaniczne" },
    ],
  };
  assert.equal(renderSchema(schema({ risks }), instance), expected);
});

test("a $ref item is resolved through the document's own $defs", () => {
  const findings = {
    type: "array",
    title: "Findings",
    description: "One row per verified finding.",
    items: { $ref: "#/$defs/ReviewFinding" },
  };
  const withDefs = {
    ...schema({ findings }),
    $defs: {
      ReviewFinding: {
        type: "object",
        title: "Finding",
        description: "A single verified finding.",
        properties: {
          file: { type: "string", title: "File", description: "Repo-relative path." },
          severity: { type: "string", title: "Severity", description: "How much damage it does." },
        },
      },
    },
  };
  const expected = `## Implementation plan

### Findings

| File | Severity |
|------|----------|
| scripts/types/render-schema.ts | minor |
`;
  const instance = { findings: [{ file: "scripts/types/render-schema.ts", severity: "minor" }] };
  assert.equal(renderSchema(withDefs, instance), expected);
});

test("the caller can head the document with something other than the schema title", () => {
  const expected = `## MINIMAL variant (small, clear tasks)

### Objective

<!-- One paragraph: what problem we solve and for whom. -->
`;
  const rendered = renderSchema(schema({ objective }), PLACEHOLDER, { heading: "MINIMAL variant (small, clear tasks)" });
  assert.equal(rendered, expected);
});

test("requiredOnly drops the properties the schema does not require", () => {
  const expected = `## Implementation plan

### Objective

<!-- One paragraph: what problem we solve and for whom. -->
`;
  const full = schema({ objective, dependencies }, ["objective"]);
  assert.equal(renderSchema(full, PLACEHOLDER, { requiredOnly: true }), expected);
});

test("a long hint wraps at 80 columns, continuation lines aligned under the comment opener", () => {
  const checklist = {
    type: "string",
    title: "Implementation checklist",
    description:
      "Use ONLY when the work is one deliverable with clear steps and is NOT split into sub-issues. If split into sub-issues, drop this section.",
  };
  const expected = `## Implementation plan

### Implementation checklist

<!-- Use ONLY when the work is one deliverable with clear steps and is NOT split
     into sub-issues. If split into sub-issues, drop this section. -->
`;
  assert.equal(renderSchema(schema({ checklist }), PLACEHOLDER), expected);
});

test("a note leads the variant in, right under its heading", () => {
  const expected = `## CHILD sub-issue (when splitting into stages)

<!-- Each child is a focused slice of the parent. Keep it lean. -->

### Objective

<!-- One paragraph: what problem we solve and for whom. -->
`;
  const rendered = renderSchema(schema({ objective }), PLACEHOLDER, {
    heading: "CHILD sub-issue (when splitting into stages)",
    note: "Each child is a focused slice of the parent. Keep it lean.",
  });
  assert.equal(rendered, expected);
});

test("an absent or null value drops its section instead of writing undefined into the comment", () => {
  const context = { type: "string", title: "Problem & context", description: "why now" };
  const expected = `## Implementation plan

### Objective

Every edge answers what travels through it.
`;
  const filled = { objective: "Every edge answers what travels through it." };
  assert.equal(renderSchema(schema({ objective, context }), filled), expected);
  assert.equal(renderSchema(schema({ objective, context }), { ...filled, context: null }), expected);
});

test("a pipe or a newline inside a cell does not break the table around it", () => {
  const expected = `## Implementation plan

### Risks

| Risk | Mitigation |
|------|------------|
| a \\| b splits the row | line1<br>line2 |
`;
  const instance = { risks: [{ risk: "a | b splits the row", mitigation: "line1\nline2" }] };
  assert.equal(renderSchema(schema({ risks }), instance), expected);
});
