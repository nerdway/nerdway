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

test("auto-issue-mode writes in-progress after the plan comment and continues without asking", () => {
  const skill = compact("skills/auto-issue-mode/SKILL.md");
  assert.match(skill, /write phase `in-progress` with `issue.set-status` \(AIM autonomy after the plan\)/);
  assert.match(skill, /without asking/);
  assert.match(skill, /do not wait for a manual/);
  assert.match(skill, /first heading line is `## Implementation plan`/);
  assert.match(skill, /never stage 1/);
});

test("issue-workflow hard gates exempt AIM writing in-progress after the plan", () => {
  const skill = compact("skills/issue-workflow/SKILL.md");
  assert.match(skill, /Exception — auto-issue-mode/);
  assert.match(skill, /plan comment already exists, writing `in-progress`/);
  assert.match(skill, /Interactive path|interactive/);
  assert.match(skill, /first heading line is `## Implementation plan`/);
});

test("issue-next-step names planning as next when in-progress has no plan", () => {
  const skill = compact("skills/issue-next-step/SKILL.md");
  assert.match(skill, /`in-progress` \| no plan \| planning/);
});

test("issue-workflow evals cover fail-jump, plan-then-Start, no-waiver, and AIM autonomy", () => {
  const failJump = requiredCase("skills/issue-workflow/evals/evals.json", "in-progress-no-plan-plans-first");
  const passStart = requiredCase("skills/issue-workflow/evals/evals.json", "dispatch-in-progress-starts");
  const noWaiver = requiredCase("skills/issue-workflow/evals/evals.json", "ac-handoff-does-not-waive-plan");
  const aimPass = requiredCase("skills/issue-workflow/evals/evals.json", "aim-plan-then-set-in-progress-starts");
  const aimFail = requiredCase("skills/issue-workflow/evals/evals.json", "aim-no-plan-no-start");

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

  assert.match(bodyOf(aimPass), /auto-issue-mode/);
  assert.match(bodyOf(aimPass), /issue.set-status/);
  assert.match(bodyOf(aimPass), /does not ask/);
  assert.match(bodyOf(aimPass), /issue-start/);

  assert.match(bodyOf(aimFail), /auto-issue-mode/);
  assert.match(bodyOf(aimFail), /no comment starting with `## Implementation plan`/);
  assert.match(bodyOf(aimFail), /zrób od razu/);
  assert.match(bodyOf(aimFail), /does not Start/);
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
