import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SkillEval, SkillEvalsFile } from "./evals.ts";
import { findEvalsFiles, validateEvalsFile } from "./evals.ts";

function evalCase(overrides: Partial<SkillEval> = {}): SkillEval {
  return {
    id: "bootstrap-empty-dir",
    prompt: "start a new project",
    expected_output: "a scaffolded repo",
    files: [],
    assertions: ["README.md exists"],
    ...overrides,
  };
}

function evalsFile(overrides: Partial<SkillEvalsFile> = {}): SkillEvalsFile {
  return { skill_name: "new-project-workflow", evals: [evalCase()], ...overrides };
}

test("a well-formed evals file has no errors", () => {
  assert.deepEqual(validateEvalsFile(evalsFile()), []);
});

test("an empty skill_name is rejected", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ skill_name: "  " })), [
    "skill_name must be non-empty",
  ]);
});

test("an empty evals list is rejected", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [] })), [
    "evals must contain at least one case",
  ]);
});

test("an eval without an id is rejected", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [evalCase({ id: "" })] })), [
    "each eval must have an id",
  ]);
});

test("an eval without a prompt is rejected", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [evalCase({ prompt: "" })] })), [
    "eval 'bootstrap-empty-dir' must have a prompt",
  ]);
});

test("an eval without assertions is rejected", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [evalCase({ assertions: [] })] })), [
    "eval 'bootstrap-empty-dir' must have assertions",
  ]);
});

test("findEvalsFiles returns every skills/*/evals/evals.json, sorted, and skips skills without evals", () => {
  const root = mkdtempSync(join(tmpdir(), "evals-find-"));
  for (const skill of ["zeta", "alpha"]) {
    mkdirSync(join(root, "skills", skill, "evals"), { recursive: true });
    writeFileSync(join(root, "skills", skill, "evals", "evals.json"), "{}");
  }
  mkdirSync(join(root, "skills", "no-evals"), { recursive: true });
  writeFileSync(join(root, "skills", "no-evals", "SKILL.md"), "");

  assert.deepEqual(findEvalsFiles(root), [
    join(root, "skills", "alpha", "evals", "evals.json"),
    join(root, "skills", "zeta", "evals", "evals.json"),
  ]);
});
