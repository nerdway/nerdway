import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

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

const EVALS = "skills/board-setup/evals/evals.json";
const SKILL = "skills/board-setup/SKILL.md";

test("board-setup evals cover admin, labels only, none, Jira guided path, Linear defaults, consent declined, and 403 drop", () => {
  const admin = requiredCase(EVALS, "admin-native-creates-then-binds");
  const labels = requiredCase(EVALS, "labels-only-cascade");
  const none = requiredCase(EVALS, "none-switches-to-comment");
  const jira = requiredCase(EVALS, "jira-guided-path-no-api-write");
  const linearOk = requiredCase(EVALS, "linear-defaults-bind-no-create");
  const linearStop = requiredCase(EVALS, "linear-missing-default-stops");
  const declined = requiredCase(EVALS, "consent-declined-creates-nothing");
  const forbidden = requiredCase(EVALS, "403-drops-exactly-one-level");
  assert.match(bodyOf(admin), /native/);
  assert.match(bodyOf(admin), /bind-statuses/);
  assert.match(bodyOf(labels), /label/);
  assert.match(bodyOf(none), /comment/);
  assert.match(bodyOf(jira), /workflow editor/i);
  assert.match(bodyOf(jira), /no Jira REST|does not call a Jira REST/i);
  assert.match(bodyOf(linearOk), /strategy native/);
  assert.match(bodyOf(linearOk), /status.create/);
  assert.match(bodyOf(linearStop), /In Review/);
  assert.match(bodyOf(linearStop), /stops|stop/);
  assert.match(bodyOf(declined), /no/);
  assert.match(bodyOf(forbidden), /403/);
  assert.match(bodyOf(forbidden), /label/);
});

test("board-setup skill reports the cascade, asks before creating, and hands the map to bind-statuses", () => {
  const skill = read(SKILL);
  assert.match(skill, /board\.rights/);
  assert.match(skill, /decideLevel/);
  assert.match(skill, /dropLevel/);
  assert.match(skill, /Detected level/);
  assert.match(skill, /explicit yes/);
  assert.match(skill, /HTTP 403/);
  assert.match(skill, /nerdway:bind-statuses/);
  assert.match(skill, /workflowStateCreate/);
  assert.match(skill, /No creation path/);
  assert.match(skill, /GitLab/);
  assert.match(skill, /strategy stays `label`/);
});
