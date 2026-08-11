import { test } from "node:test";
import assert from "node:assert/strict";

import { extractInlineSchemas, validateContract } from "./workflow-graph.ts";

const skillDirs = ["linear-issue-writer", "linear-issue-workflow", "linear-issue-close"];

const failure = { retries: 0, fallback: "report and stop", killsRun: true, reporting: "linear-comment" };

function schemaBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "object",
    title: "Implementation plan",
    properties: {
      objective: { type: "string", title: "Objective", description: "what we solve and for whom" },
    },
    required: ["objective"],
    ...overrides,
  };
}

function entryNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "write",
    skill: "linear-issue-writer",
    runtime: "conversational",
    phase: "write",
    entry: true,
    in: [],
    out: ["IssueSpec"],
    dependsOn: [],
    failure,
    budget: { maxWidth: 1 },
    gates: [],
    ...overrides,
  };
}

function planNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan",
    skill: "linear-issue-workflow",
    runtime: "conversational",
    phase: "plan",
    in: ["IssueSpec"],
    out: ["ImplementationPlan"],
    dependsOn: ["write"],
    failure,
    budget: { maxWidth: 1 },
    gates: [],
    ...overrides,
  };
}

function contract(nodes: unknown[] = [entryNode(), planNode()], overrides: Record<string, unknown> = {}) {
  return {
    schemas: [
      { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ title: "Issue spec" }) },
      { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
    ],
    nodes,
    ...overrides,
  };
}

test("accepts a minimal valid contract", () => {
  assert.deepEqual(validateContract(contract(), skillDirs), []);
});

test("rejects a non-object payload", () => {
  assert.equal(validateContract(null, skillDirs).length, 1);
});

test("rule 1: rejects a node whose skill has no directory under skills/", () => {
  const errors = validateContract(contract([entryNode(), planNode({ skill: "ghost-skill" })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost-skill/);
});

test("rule 2: rejects a dependsOn naming no existing node id", () => {
  const errors = validateContract(contract([entryNode(), planNode({ dependsOn: ["ghost-node"] })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost-node/);
});

test("rule 3: rejects an edge whose ends share no schema", () => {
  const errors = validateContract(contract([entryNode(), planNode({ in: ["ImplementationPlan"] })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /write -> plan/);
});

test("rule 3: rejects a schema name absent from the registry", () => {
  const errors = validateContract(contract([entryNode(), planNode({ out: ["GhostSchema"] })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /GhostSchema/);
});

test("rule 3: rejects a node consumed downstream but declaring no output", () => {
  const errors = validateContract(contract([entryNode({ out: [] }), planNode()]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /write -> plan/);
});

test("rule 4: rejects a node with no dependsOn that is not marked as the axis entry", () => {
  const errors = validateContract(contract([entryNode({ entry: undefined }), planNode()]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /orphan/i);
});

test("rule 5: rejects a cycle", () => {
  const looping = entryNode({ entry: undefined, dependsOn: ["plan"], in: ["ImplementationPlan"] });
  const errors = validateContract(contract([looping, planNode()]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cycle/i);
});

test("rule 6: rejects an irreversible node with no gate", () => {
  const errors = validateContract(contract([entryNode(), planNode({ irreversible: true })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /irreversible/i);
});

test("rule 7: rejects a node with no failure policy", () => {
  const errors = validateContract(contract([entryNode(), planNode({ failure: undefined })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /failure/i);
});

test("rule 7: rejects a failure policy missing killsRun", () => {
  const errors = validateContract(
    contract([entryNode(), planNode({ failure: { retries: 0, fallback: "stop", reporting: "linear-comment" } })]),
    skillDirs,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /killsRun/);
});

test("rejects a duplicate node id", () => {
  const errors = validateContract(contract([entryNode(), planNode(), planNode()]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate/i);
});

const decisionGate = { kind: "decision", mechanism: "linear-status", description: "human moves the issue to In Progress" };

test("rule 8: rejects a decision gate inside a workflow node", () => {
  const errors = validateContract(contract([entryNode(), planNode({ runtime: "workflow", gates: [decisionGate] })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /decision gate/i);
});

test("rule 8: accepts a decision gate on a conversational node", () => {
  assert.deepEqual(validateContract(contract([entryNode(), planNode({ gates: [decisionGate] })]), skillDirs), []);
});

test("rule 9: rejects a maxWidth above the runtime cap of 16", () => {
  const errors = validateContract(contract([entryNode(), planNode({ budget: { maxWidth: 17 } })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /maxWidth/);
});

test("rule 9: rejects a maxWidth below one", () => {
  const errors = validateContract(contract([entryNode(), planNode({ budget: { maxWidth: 0 } })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /maxWidth/);
});

test("rule 10: rejects a workflow script inlining a schema the contract does not declare", () => {
  const inlined = [{ script: "workflows/plan-fanout.js", schema: "GhostSchema" }];
  const errors = validateContract(contract(), skillDirs, inlined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /plan-fanout\.js/);
  assert.match(errors[0], /GhostSchema/);
});

test("rule 10: accepts a workflow script inlining a declared schema", () => {
  const inlined = [{ script: "workflows/plan-fanout.js", schema: "ImplementationPlan", body: schemaBody() }];
  assert.deepEqual(validateContract(contract(), skillDirs, inlined), []);
});

const fanoutScript = "workflows/plan-fanout.js";

function boundNode(overrides: Record<string, unknown> = {}) {
  return planNode({ runtime: "workflow", script: fanoutScript, ...overrides });
}

function inlinedPlan(overrides: Record<string, unknown> = {}) {
  return { script: fanoutScript, schema: "ImplementationPlan", body: schemaBody(), ...overrides };
}

test("rule 17: accepts a bound node whose out schemas are inlined in its script", () => {
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [inlinedPlan()], [fanoutScript]);
  assert.deepEqual(errors, []);
});

test("rule 17: rejects a script binding on a node that is not a workflow", () => {
  const errors = validateContract(contract([entryNode(), planNode({ script: fanoutScript })]), skillDirs, [inlinedPlan()], [fanoutScript]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /script/);
  assert.match(errors[0], /workflow/);
});

test("rule 17: rejects a binding whose script file does not exist", () => {
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [inlinedPlan()], []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /plan-fanout\.js/);
});

test("rule 17: rejects a bound node whose out schema is never inlined in its script", () => {
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [], [fanoutScript]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ImplementationPlan/);
  assert.match(errors[0], /plan-fanout\.js/);
});

test("rule 17: an inline in a different script does not satisfy the binding", () => {
  const elsewhere = inlinedPlan({ script: "workflows/other.js" });
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [elsewhere], [fanoutScript, "workflows/other.js"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ImplementationPlan/);
});

test("rule 17: does not require the node's in schemas to be inlined", () => {
  // boundNode consumes IssueSpec, which is nowhere inlined — inputs arrive via args.
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [inlinedPlan()], [fanoutScript]);
  assert.deepEqual(errors, []);
});

test("rule 17: a workflow node without a binding stays legal — its island is not built yet", () => {
  const errors = validateContract(contract([entryNode(), planNode({ runtime: "workflow" })]), skillDirs);
  assert.deepEqual(errors, []);
});

test("rule 17: rejects a script binding that is not a string", () => {
  const errors = validateContract(contract([entryNode(), boundNode({ script: 42 })]), skillDirs, [inlinedPlan()], [fanoutScript]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /script/);
});

test("rule 18: rejects an inline body that drifted from the registry body", () => {
  const drifted = inlinedPlan({ body: schemaBody({ title: "Something else" }) });
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [drifted], [fanoutScript]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ImplementationPlan/);
  assert.match(errors[0], /verbatim/);
});

test("rule 18: rejects an inline body missing a nested property of the registry body", () => {
  const body = schemaBody({ properties: { objective: { type: "string", title: "Objective" } } });
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [inlinedPlan({ body })], [fanoutScript]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ImplementationPlan/);
});

test("rule 18: rejects an inline literal that is not strict JSON", () => {
  const unparsable = inlinedPlan({ body: undefined });
  const errors = validateContract(contract([entryNode(), boundNode()]), skillDirs, [unparsable], [fanoutScript]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /JSON/);
});

test("rule 18: holds for an inline of a declared schema even without a node binding", () => {
  const drifted = inlinedPlan({ body: schemaBody({ title: "Something else" }) });
  const errors = validateContract(contract(), skillDirs, [drifted]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ImplementationPlan/);
});

test("extractInlineSchemas: extracts the name and parsed body of a strict-JSON literal", () => {
  const source = `const SCHEMA_PlanContext = {\n  "type": "object",\n  "title": "Plan context"\n}\nrest of the script`;
  const uses = extractInlineSchemas(fanoutScript, source);
  assert.deepEqual(uses, [
    { script: fanoutScript, schema: "PlanContext", body: { type: "object", title: "Plan context" } },
  ]);
});

test("extractInlineSchemas: a literal that is not strict JSON yields an undefined body", () => {
  const source = `const SCHEMA_PlanContext = { type: 'object' }`;
  const uses = extractInlineSchemas(fanoutScript, source);
  assert.equal(uses.length, 1);
  assert.equal(uses[0].body, undefined);
});

test("extractInlineSchemas: braces inside string values do not break the balanced scan", () => {
  const source = `const SCHEMA_PlanContext = { "description": "a { brace } and \\" quote" }`;
  const uses = extractInlineSchemas(fanoutScript, source);
  assert.deepEqual(uses[0].body, { description: 'a { brace } and " quote' });
});

test("extractInlineSchemas: finds every SCHEMA_ constant in one file", () => {
  const source = `const SCHEMA_PlanContext = { "type": "object" }\nconst other = 1\nconst SCHEMA_ProjectContext = { "type": "object" }`;
  const uses = extractInlineSchemas(fanoutScript, source).map((use) => use.schema);
  assert.deepEqual(uses, ["PlanContext", "ProjectContext"]);
});

test("extractInlineSchemas: an unterminated literal yields an undefined body", () => {
  const source = `const SCHEMA_PlanContext = { "type": "object", "title": "Plan context"`;
  const uses = extractInlineSchemas(fanoutScript, source);
  assert.equal(uses.length, 1);
  assert.equal(uses[0].body, undefined);
});

test("rule 18: a reordered required array is not a verbatim copy", () => {
  const twoProps = schemaBody({
    properties: {
      objective: { type: "string", title: "Objective", description: "what we solve" },
      scope: { type: "string", title: "Scope", description: "what is in and out" },
    },
    required: ["objective", "scope"],
  });
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ title: "Issue spec" }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: twoProps },
  ];
  const reordered = { ...twoProps, required: ["scope", "objective"] };
  const inlined = [{ script: fanoutScript, schema: "ImplementationPlan", body: reordered }];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs, inlined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /verbatim/);
});

test("extractInlineSchemas: a name not followed by an object literal yields an undefined body", () => {
  const source = `const SCHEMA_PlanContext = buildSchema()`;
  const uses = extractInlineSchemas(fanoutScript, source);
  assert.equal(uses.length, 1);
  assert.equal(uses[0].body, undefined);
});

test("rejects an unknown gate kind", () => {
  const gates = [{ kind: "ask", mechanism: "chat", description: "asks the user mid-run" }];
  const errors = validateContract(contract([entryNode(), planNode({ gates })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ask/);
});

test("rejects a duplicate schema id in the registry", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ title: "Issue spec" }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
    { id: "IssueSpec", description: "declared twice", schema: schemaBody({ title: "Issue spec" }) },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /IssueSpec/);
});

test("rejects a node that is not an object instead of throwing", () => {
  const errors = validateContract(contract([entryNode(), null]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must be an object/);
});

test("rejects a node id that is not a string", () => {
  const errors = validateContract(contract([entryNode(), planNode({ id: 123 })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /string id/);
});

test("rejects an out that is not an array of schema names", () => {
  const errors = validateContract(contract([entryNode(), planNode({ out: "ImplementationPlan" })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /out must be an array/);
});

test("rejects a dependsOn that is not an array without also calling the node orphaned", () => {
  const errors = validateContract(contract([entryNode(), planNode({ dependsOn: "write" })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /dependsOn must be an array/);
});

test("rule 11: rejects a registry entry carrying no schema body", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed" },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /IssueSpec/);
});

test("rule 11: rejects a schema body that is not an object schema", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ type: "string" }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /IssueSpec/);
});

test("rule 11: rejects a schema body with no title for the renderer to head the section with", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ title: "" }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /title/);
});

test("rule 12: rejects a schema body whose properties are empty", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ properties: {}, required: [] }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /properties/);
});

test("rule 12: rejects properties that are an array instead of an object", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ properties: ["objective"], required: [] }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /properties/);
});

test("rule 13: rejects a required entry that names no declared property", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ required: ["objective", "ghost"] }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost/);
});

test("rule 13: rejects a required that is not an array of property names", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ required: "objective" }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /required/);
});

test("rule 14: rejects a property with no title", () => {
  const properties = { objective: { type: "string", description: "what we solve" } };
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ properties }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /objective/);
});

test("rule 14: rejects a property with no description for the template hint", () => {
  const properties = { objective: { type: "string", title: "Objective" } };
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ properties }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /description/);
});

test("rule 14: reaches properties nested in items and $defs", () => {
  const nested = schemaBody({
    properties: {
      findings: {
        type: "array",
        title: "Findings",
        description: "one row per finding",
        items: { $ref: "#/$defs/Finding" },
      },
    },
    required: ["findings"],
    $defs: {
      Finding: {
        type: "object",
        title: "Finding",
        description: "a single finding",
        properties: { file: { type: "string", title: "File" } },
        required: ["file"],
      },
    },
  });
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: nested },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /file/);
});

function findingsBody(overrides: Record<string, unknown> = {}) {
  return schemaBody({
    title: "Review findings",
    properties: {
      findings: {
        type: "array",
        title: "Findings",
        description: "one row per finding",
        items: { $ref: "#/$defs/Finding" },
      },
    },
    required: ["findings"],
    $defs: {
      Finding: {
        type: "object",
        title: "Finding",
        description: "a single finding",
        properties: { file: { type: "string", title: "File", description: "path of the file" } },
        required: ["file"],
      },
    },
    ...overrides,
  });
}

test("rule 15: accepts a $ref into the document's own $defs", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: findingsBody() },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  assert.deepEqual(validateContract(contract(undefined, { schemas }), skillDirs), []);
});

test("rule 15: rejects a $ref reaching outside the document", () => {
  const properties = {
    findings: {
      type: "array",
      title: "Findings",
      description: "one row per finding",
      items: { $ref: "ImplementationPlan" },
    },
  };
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: findingsBody({ properties }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\$ref/);
});

test("rule 15: rejects a $ref naming a $defs entry the document does not define", () => {
  const properties = {
    findings: {
      type: "array",
      title: "Findings",
      description: "one row per finding",
      items: { $ref: "#/$defs/Ghost" },
    },
  };
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: findingsBody({ properties }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Ghost/);
});

test("rejects a schema registry entry with no description", () => {
  const schemas = [
    { id: "IssueSpec", schema: schemaBody({ title: "Issue spec" }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /IssueSpec/);
});

test("rejects a gate that names no mechanism", () => {
  const gates = [{ kind: "deny", description: "no repo write before the plan is accepted" }];
  const errors = validateContract(contract([entryNode(), planNode({ gates })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /mechanism/);
});

test("rejects a second node marked as the axis entry", () => {
  const errors = validateContract(contract([entryNode(), planNode({ entry: true })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /entry/i);
});

test("reports every problem rather than stopping at the first", () => {
  const broken = planNode({ skill: "ghost-skill", budget: { maxWidth: 99 } });
  assert.equal(validateContract(contract([entryNode(), broken]), skillDirs).length, 2);
});

test("rejects an unknown runtime", () => {
  const errors = validateContract(contract([entryNode(), planNode({ runtime: "island" })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /island/);
});

test("rule 13: reaches the required lists nested in items and $defs", () => {
  const nested = findingsBody({
    properties: {
      findings: {
        type: "array",
        title: "Findings",
        description: "one row per finding",
        items: {
          type: "object",
          title: "Finding",
          description: "a single finding",
          properties: { file: { type: "string", title: "File", description: "path of the file" } },
          required: ["ghostInItems"],
        },
      },
    },
    $defs: {
      Finding: {
        type: "object",
        title: "Finding",
        description: "a single finding",
        properties: { file: { type: "string", title: "File", description: "path of the file" } },
        required: ["ghostInDefs"],
      },
    },
  });
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: nested },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((error) => error.includes("ghostInItems")));
  assert.ok(errors.some((error) => error.includes("ghostInDefs")));
});

test("rule 13: a required entry inherited from the prototype chain is not a declared property", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ required: ["toString"] }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /toString/);
});

test("rejects a $defs entry that is not a schema object", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: findingsBody({ $defs: { Finding: "not a schema" } }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Finding/);
});

test("rejects a $defs that is not an object of definitions", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: findingsBody({ $defs: ["Finding"] }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.ok(errors.some((error) => /\$defs/.test(error)), JSON.stringify(errors));
});

test("rule 16: rejects an x-render mode the renderer does not know", () => {
  const properties = {
    criteria: {
      type: "array",
      title: "Acceptance criteria",
      description: "each item independently verifiable",
      "x-render": "checkist",
      items: { type: "string" },
    },
  };
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ properties, required: [] }) },
    { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /checkist/);
});

test("rule 16: accepts the modes the renderer implements", () => {
  for (const mode of ["checklist", "numbered"]) {
    const properties = {
      criteria: {
        type: "array",
        title: "Acceptance criteria",
        description: "each item independently verifiable",
        "x-render": mode,
        items: { type: "string" },
      },
    };
    const schemas = [
      { id: "IssueSpec", description: "the issue as filed", schema: schemaBody({ properties, required: [] }) },
      { id: "ImplementationPlan", description: "the plan posted to Linear", schema: schemaBody() },
    ];
    assert.deepEqual(validateContract(contract(undefined, { schemas }), skillDirs), []);
  }
});
