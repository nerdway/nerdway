import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SkillEval, SkillEvalsFile } from "./evals.ts";
import { findEvalsFiles, readEvalsFile, validateEvalsFile } from "./evals.ts";

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

test("a missing skill_name is an error, not an exception", () => {
  const { skill_name: _, ...rest } = evalsFile();
  assert.deepEqual(validateEvalsFile(rest), ["skill_name must be a string"]);
});

test("a missing evals list is an error, not an exception", () => {
  assert.deepEqual(validateEvalsFile({ skill_name: "new-project-workflow" }), ["evals must be an array of eval cases"]);
});

test("a file that is not an object is an error, not an exception", () => {
  assert.deepEqual(validateEvalsFile(null), ["the evals file must be a JSON object"]);
  assert.deepEqual(validateEvalsFile([]), ["the evals file must be a JSON object"]);
});

test("every missing field of an eval is reported, none throws", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [{} as SkillEval] })), [
    "eval #1: id must be a string",
    "eval #1: prompt must be a string",
    "eval #1: expected_output must be a string",
    "eval #1: files must be an array of strings",
    "eval #1: assertions must be an array of strings",
  ]);
});

test("a field of the wrong type is reported under the eval's id", () => {
  const broken = { ...evalCase(), files: "README.md", assertions: [1] } as unknown as SkillEval;
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [broken] })), [
    "eval 'bootstrap-empty-dir': files must be an array of strings",
    "eval 'bootstrap-empty-dir': assertions must be an array of strings",
  ]);
});

test("an eval that is not an object is reported by its position", () => {
  assert.deepEqual(validateEvalsFile(evalsFile({ evals: [evalCase(), "case" as unknown as SkillEval] })), [
    "eval #2 must be an object",
  ]);
});

test("skill_name must equal the skill directory", () => {
  assert.deepEqual(validateEvalsFile(evalsFile(), "new-project-workflow"), []);
  assert.deepEqual(validateEvalsFile(evalsFile(), "issue-start"), [
    "skill_name 'new-project-workflow' does not match the skill directory 'issue-start'",
  ]);
});

test("ids must be unique within the file", () => {
  const evals = [evalCase(), evalCase({ prompt: "another" }), evalCase({ id: "other" })];
  assert.deepEqual(validateEvalsFile(evalsFile({ evals })), ["eval id 'bootstrap-empty-dir' is used more than once"]);
});

test("readEvalsFile turns unreadable JSON into an error and checks the directory name", () => {
  const root = mkdtempSync(join(tmpdir(), "evals-read-"));
  const dir = join(root, "skills", "issue-start", "evals");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "evals.json");

  writeFileSync(path, "{ not json");
  assert.match(readEvalsFile(path).errors[0], /^the evals file is not valid JSON: /);

  writeFileSync(path, JSON.stringify(evalsFile()));
  assert.deepEqual(readEvalsFile(path).errors, [
    "skill_name 'new-project-workflow' does not match the skill directory 'issue-start'",
  ]);

  writeFileSync(path, JSON.stringify(evalsFile({ skill_name: "issue-start" })));
  const ok = readEvalsFile(path);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.file?.skill_name, "issue-start");
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
