import { test } from "node:test";
import assert from "node:assert/strict";

import { validateContract } from "./workflow-graph.ts";

const skillDirs = ["linear-issue-writer", "linear-issue-workflow", "linear-issue-close"];

const failure = { retries: 0, fallback: "report and stop", killsRun: true, reporting: "linear-comment" };

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
      { id: "IssueSpec", description: "the issue as filed" },
      { id: "ImplementationPlan", description: "the plan posted to Linear" },
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
  const inlined = [{ script: "workflows/plan-fanout.js", schema: "ImplementationPlan" }];
  assert.deepEqual(validateContract(contract(), skillDirs, inlined), []);
});

test("rejects an unknown gate kind", () => {
  const gates = [{ kind: "ask", mechanism: "chat", description: "asks the user mid-run" }];
  const errors = validateContract(contract([entryNode(), planNode({ gates })]), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ask/);
});

test("rejects a duplicate schema id in the registry", () => {
  const schemas = [
    { id: "IssueSpec", description: "the issue as filed" },
    { id: "ImplementationPlan", description: "the plan posted to Linear" },
    { id: "IssueSpec", description: "declared twice" },
  ];
  const errors = validateContract(contract(undefined, { schemas }), skillDirs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /IssueSpec/);
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
