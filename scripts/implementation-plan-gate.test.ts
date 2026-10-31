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

test("issue-workflow writes in-progress after an implement command when the plan exists", () => {
  const skill = compact("skills/issue-workflow/SKILL.md");
  assert.match(skill, /zaimplementuj/);
  assert.match(skill, /explicit implement command/);
  assert.match(skill, /write `in-progress` and continue Start/);
  assert.match(skill, /do not wait for a manual status click/);
  assert.match(skill, /auto-issue-mode/);
  assert.match(skill, /first heading line is `## Implementation plan`/);
  assert.match(skill, /even when the user said `zaimplementuj`/);
});

test("issue-workflow post-plan branches on the detected host", () => {
  const skill = compact("skills/issue-workflow/SKILL.md");
  assert.match(skill, /adapters\/hosts/);
  assert.match(skill, /host\.detect/);
  assert.match(skill, /post-plan\.after-plan/);
  assert.match(skill, /SendToUser/);
  assert.match(skill, /AskUserQuestion/);
  assert.match(skill, /AskQuestion/);
  assert.match(skill, /Implementuj teraz/);
  assert.match(skill, /Później/);
  assert.match(skill, /Asking the human to move a phase/);
  assert.match(skill, /AIM does not read `hosts\/`/);
});

test("auto-issue-mode does not read the hosts axis", () => {
  const aim = read("skills/auto-issue-mode/SKILL.md");
  assert.doesNotMatch(aim, /adapters\/hosts/);
  assert.doesNotMatch(aim, /host\.detect/);
  assert.doesNotMatch(aim, /post-plan\.after-plan/);
  assert.doesNotMatch(aim, /SendToUser/);
  assert.doesNotMatch(aim, /Implementuj teraz/);
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
  const implPass = requiredCase("skills/issue-workflow/evals/evals.json", "implement-command-with-plan-starts");
  const implFail = requiredCase("skills/issue-workflow/evals/evals.json", "implement-command-without-plan-plans-only");

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

  assert.match(bodyOf(implPass), /zaimplementuj DEMO-661/);
  assert.match(bodyOf(implPass), /issue.set-status/);
  assert.match(bodyOf(implPass), /does not ask/);
  assert.match(bodyOf(implPass), /issue-start/);

  assert.match(bodyOf(implFail), /zaimplementuj DEMO-662/);
  assert.match(bodyOf(implFail), /no comment starting with `## Implementation plan`/);
  assert.match(bodyOf(implFail), /does not Start/);
  assert.match(bodyOf(implFail), /does not write in-progress/);

  const grokNow = requiredCase("skills/issue-workflow/evals/evals.json", "post-plan-grok-bot-implement-now");
  const grokLater = requiredCase("skills/issue-workflow/evals/evals.json", "post-plan-grok-bot-later");
  const ccProse = requiredCase("skills/issue-workflow/evals/evals.json", "post-plan-claude-code-prose");
  const cursorProse = requiredCase("skills/issue-workflow/evals/evals.json", "post-plan-cursor-prose");
  const detect = requiredCase("skills/issue-workflow/evals/evals.json", "host-detect-prefers-sendtouser");

  assert.match(bodyOf(grokNow), /SendToUser/);
  assert.match(bodyOf(grokNow), /Implementuj teraz/);
  assert.match(bodyOf(grokNow), /issue.set-status/);
  assert.match(bodyOf(grokNow), /issue-start/);

  assert.match(bodyOf(grokLater), /Później/);
  assert.match(bodyOf(grokLater), /does not write in-progress/);
  assert.match(bodyOf(grokLater), /todo/);

  assert.match(bodyOf(ccProse), /AskUserQuestion/);
  assert.match(bodyOf(ccProse), /Asking the human to move a phase|move the issue to In Progress/);
  assert.match(bodyOf(ccProse), /does not write in-progress/);
  assert.doesNotMatch(bodyOf(ccProse), /write phase in-progress with issue.set-status and Starts/);

  assert.match(bodyOf(cursorProse), /AskQuestion/);
  assert.match(bodyOf(cursorProse), /move the issue to In Progress/);
  assert.match(bodyOf(cursorProse), /does not write in-progress/);

  assert.match(bodyOf(detect), /SendToUser/);
  assert.match(bodyOf(detect), /AskUserQuestion/);
  assert.match(bodyOf(detect), /Grok Bot/);
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
