import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const compact = (path: string) => read(path).replace(/\s+/g, " ");

type EvalCase = { id: string; prompt: string; expected_output: string; assertions: string[] };

function evalCases(path: string): EvalCase[] {
  return JSON.parse(read(path)).evals;
}

function requiredCase(path: string, id: string): EvalCase {
  const found = evalCases(path).find((evalCase) => evalCase.id === id);
  assert.ok(found, `missing eval id ${id} in ${path}`);
  return found;
}

function bodyOf(evalCase: EvalCase): string {
  return [evalCase.prompt, evalCase.expected_output, ...evalCase.assertions].join("\n");
}

test("issue-workflow hard-gates a posted Implementation plan before any repo change", () => {
  const skill = compact("skills/issue-workflow/SKILL.md");
  assert.match(skill, /Hard gates/);
  assert.match(skill, /first heading line is `## Implementation plan`/);
  assert.match(skill, /Never Start, never edit, never CloudAgent/);
  assert.match(skill, /zrób od razu/);
  assert.match(skill, /do not waive/);
  assert.match(skill, /in-progress.*no comment starting with `## Implementation plan`/);
});

test("auto-issue-mode runs stage 2 before any Start or CloudAgent when the plan is missing", () => {
  const skill = compact("skills/auto-issue-mode/SKILL.md");
  assert.match(skill, /first heading line is `## Implementation plan`/);
  assert.match(skill, /never stage 1/);
  assert.match(skill, /never a CloudAgent/);
  assert.match(skill, /zrób od razu/);
  assert.match(skill, /do not waive/);
});

test("issue-next-step names planning as next when in-progress has no plan", () => {
  const skill = compact("skills/issue-next-step/SKILL.md");
  assert.match(skill, /`in-progress` \| no plan \| planning/);
});

test("issue-workflow evals cover fail-jump, plan-then-Start, and no-waiver", () => {
  const failJump = requiredCase("skills/issue-workflow/evals/evals.json", "in-progress-no-plan-plans-first");
  const passStart = requiredCase("skills/issue-workflow/evals/evals.json", "dispatch-in-progress-starts");
  const noWaiver = requiredCase("skills/issue-workflow/evals/evals.json", "ac-handoff-does-not-waive-plan");

  assert.match(bodyOf(failJump), /In Progress/);
  assert.match(bodyOf(failJump), /no comment starting with `## Implementation plan`/);
  assert.match(bodyOf(failJump), /CloudAgent/);
  assert.match(bodyOf(failJump), /makes no repo change/);
  assert.match(bodyOf(failJump), /does not Start/);

  assert.match(bodyOf(passStart), /`## Implementation plan` comment/);
  assert.match(bodyOf(passStart), /issue-start/);
  assert.match(bodyOf(passStart), /does not draft a new plan/);

  assert.match(bodyOf(noWaiver), /zrób od razu/);
  assert.match(bodyOf(noWaiver), /do it now/);
  assert.match(bodyOf(noWaiver), /Handoff/);
  assert.match(bodyOf(noWaiver), /do not waive|does not treat/);
  assert.match(bodyOf(noWaiver), /makes no repo change/);
});

test("issue-next-step eval names planning when in-progress has no plan", () => {
  const evalCase = requiredCase("skills/issue-next-step/evals/evals.json", "in-progress-without-plan-is-planning");
  const body = bodyOf(evalCase);
  assert.match(body, /In Progress/);
  assert.match(body, /no comment starting with/);
  assert.match(body, /## Implementation plan/);
  assert.match(body, /next step is planning/);
  assert.match(body, /not implementation/);
});
