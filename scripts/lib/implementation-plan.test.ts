import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasImplementationPlanComment,
  IMPLEMENTATION_PLAN_HEADING,
  isUnplannedIssue,
  isUnplannedPhase,
} from "./implementation-plan.ts";

test("a comment whose first line is exactly the plan heading counts as planned", () => {
  assert.equal(
    hasImplementationPlanComment([{ body: `${IMPLEMENTATION_PLAN_HEADING}\n\n### Objective\nShip it.` }]),
    true,
  );
  assert.equal(hasImplementationPlanComment([`${IMPLEMENTATION_PLAN_HEADING}\r\nbody`]), true);
});

test("leading BOM or surrounding whitespace on the first line still matches", () => {
  assert.equal(hasImplementationPlanComment([`\uFEFF  ${IMPLEMENTATION_PLAN_HEADING}  \nsteps`]), true);
});

test("a heading that is not the first line does not count", () => {
  assert.equal(
    hasImplementationPlanComment([`Handoff\n${IMPLEMENTATION_PLAN_HEADING}\nposted later`]),
    false,
  );
});

test("a first line that only starts with the heading does not count", () => {
  assert.equal(hasImplementationPlanComment([`${IMPLEMENTATION_PLAN_HEADING} (stub)`]), false);
  assert.equal(hasImplementationPlanComment(["## Implementation plan for DEMO-473"]), false);
});

test("acceptance criteria in the description are not a plan comment", () => {
  assert.equal(hasImplementationPlanComment([]), false);
  assert.equal(hasImplementationPlanComment([{ body: "## Spec change\nWhy." }]), false);
});

test("unplanned phases are backlog, todo and in-progress only", () => {
  assert.equal(isUnplannedPhase("backlog"), true);
  assert.equal(isUnplannedPhase("todo"), true);
  assert.equal(isUnplannedPhase("in-progress"), true);
  assert.equal(isUnplannedPhase("in-review"), false);
  assert.equal(isUnplannedPhase("done"), false);
});

test("an open issue without the plan comment is unplanned", () => {
  assert.equal(isUnplannedIssue({ phase: "backlog", comments: [] }), true);
  assert.equal(isUnplannedIssue({ phase: "todo", comments: ["## Session summary"] }), true);
  assert.equal(isUnplannedIssue({ phase: "in-progress", comments: [] }), true);
});

test("in-review and done are never unplanned, even without a plan comment", () => {
  assert.equal(isUnplannedIssue({ phase: "in-review", comments: [] }), false);
  assert.equal(isUnplannedIssue({ phase: "done", comments: [] }), false);
});

test("a matching plan comment removes the issue from the unplanned set", () => {
  assert.equal(
    isUnplannedIssue({ phase: "todo", comments: [`${IMPLEMENTATION_PLAN_HEADING}\n### Scope`] }),
    false,
  );
  assert.equal(
    isUnplannedIssue({ phase: "in-progress", comments: [IMPLEMENTATION_PLAN_HEADING] }),
    false,
  );
});
