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

const BANNED_OUT_OF_SCOPE = [
  "Out of scope: implementacja w osobnym issue",
  "implementation in a separate issue",
];

test("issue-writer forbids a research-then-implement split and a follow-up implementation issue", () => {
  const skill = read("skills/issue-writer/SKILL.md").replace(/\s+/g, " ");
  assert.match(skill, /research \/ decision now, implement later/);
  assert.match(skill, /never "implement what stage 1 decided"/);
  assert.match(skill, /załóż follow-up na implementację/);
  assert.match(skill, /create an implementation issue/);
  for (const phrase of BANNED_OUT_OF_SCOPE) assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("issue-workflow returns to spec and plan on the same grilled issue", () => {
  const skill = read("skills/issue-workflow/SKILL.md").replace(/\s+/g, " ");
  assert.match(skill, /on the same `<ID>`/);
  assert.match(skill, /załóż follow-up na implementację/);
  assert.match(skill, /create an implementation issue/);
  for (const phrase of BANNED_OUT_OF_SCOPE) assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("generated Out of scope comments ban deferring this issue's implementation", () => {
  for (const path of ["skills/issue-writer/issue-template.md", "skills/issue-workflow/plan-template.md"]) {
    const text = read(path);
    assert.match(text, /never\s+this issue's own implementation/);
    assert.match(text, /implementacja w osobnym issue/);
    assert.match(text, /implementation in a separate issue/);
  }
});

test("each of grill, issue-writer and issue-workflow has a same-issue eval", () => {
  const cases = {
    grill: evalCases("skills/grill/evals/evals.json").find((evalCase) => evalCase.id === "confirmed-same-issue-no-impl-follow-up"),
    writer: evalCases("skills/issue-writer/evals/evals.json").find((evalCase) => evalCase.id === "grill-outcome-stays-on-same-issue"),
    workflow: evalCases("skills/issue-workflow/evals/evals.json").find((evalCase) => evalCase.id === "grill-then-plan-same-issue"),
  };
  assert.ok(cases.grill && cases.writer && cases.workflow);
  for (const evalCase of Object.values(cases)) {
    const body = [evalCase.prompt, evalCase.expected_output, ...evalCase.assertions].join("\n");
    assert.match(body, /DEMO-466/);
    assert.match(body, /does not propose/);
    assert.match(body, /implementacja w osobnym issue/);
  }
});

test("existing stages-in-time evals still require a distinct shippable stage 2", () => {
  const grillLarge = evalCases("skills/grill/evals/evals.json").find((evalCase) => evalCase.id === "large-outcome-names-split-kind");
  const writerStages = evalCases("skills/issue-writer/evals/evals.json").find((evalCase) => evalCase.id === "stage-one-and-stage-two");
  const writerGrillStages = evalCases("skills/issue-writer/evals/evals.json").find(
    (evalCase) => evalCase.id === "grill-on-created-issue-finds-stages",
  );
  assert.ok(grillLarge && writerStages && writerGrillStages);
  assert.match(grillLarge.assertions.join("\n"), /distinct shippable deliverable/);
  assert.match(writerStages.assertions.join("\n"), /distinct shippable deliverable/);
  assert.match(writerGrillStages.assertions.join("\n"), /distinct shippable deliverable/);
  assert.match(grillLarge.prompt, /nie implementacja decyzji etapu 1/);
  assert.match(writerStages.prompt, /nie "zaimplementuj to, co ustalił etap 1"/);
  assert.match(writerGrillStages.prompt, /not "implement what DEMO-500's grill decided"/);
});
