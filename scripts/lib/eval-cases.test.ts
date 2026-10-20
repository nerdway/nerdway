import { test } from "node:test";
import assert from "node:assert/strict";

import type { SkillEvalsFile } from "../types/evals.ts";
import { EVAL_SYSTEM_PROMPT, EVAL_TOOLS, JUDGE_PREAMBLE, caseName, parseFrontmatter, toNativeCases } from "./eval-cases.ts";

const file: SkillEvalsFile = {
  skill_name: "issue-close",
  evals: [
    {
      id: "merge-fails-stops",
      prompt: "Close out DEMO-1. The merge fails with \"conflict\".",
      expected_output: "The close-out stops at the merge and reports the error.",
      files: [],
      assertions: ["The agent does not resolve the conflict", "The agent does not write `done`"],
    },
  ],
};

const options = { evalDir: "eval-cases/20261020-1200" };

function byPath(files: { path: string; content: string }[]) {
  return new Map(files.map((item) => [item.path, item.content]));
}

test("one case directory per eval, under the skill, with a prompt and one grader per check", () => {
  const paths = toNativeCases(file, options).map((item) => item.path);
  assert.deepEqual(paths, [
    "issue-close/merge-fails-stops/prompt.md",
    "issue-close/merge-fails-stops/graders/outcome.md",
    "issue-close/merge-fails-stops/graders/assertion-01.md",
    "issue-close/merge-fails-stops/graders/assertion-02.md",
    "issue-close/merge-fails-stops/graders/skill-fired.md",
  ]);
});

test("the prompt body is the eval prompt, verbatim", () => {
  const prompt = byPath(toNativeCases(file, options)).get("issue-close/merge-fails-stops/prompt.md") ?? "";
  const { body } = parseFrontmatter(prompt);
  assert.equal(body, `${file.evals[0].prompt}\n`);
});

test("the prompt frontmatter names the case, tags the skill and loads the plugin from the root", () => {
  const prompt = byPath(toNativeCases(file, options)).get("issue-close/merge-fails-stops/prompt.md") ?? "";
  const { fields } = parseFrontmatter(prompt);
  assert.equal(fields.name, caseName("issue-close", "merge-fails-stops"));
  assert.equal(fields.name, "issue-close--merge-fails-stops");
  assert.deepEqual(fields.tags, ["issue-close"]);
  assert.deepEqual(fields.plugins, ["../../../.."]);
  assert.equal(fields.expected_outcome, file.evals[0].expected_output);
  assert.equal(typeof fields.max_turns, "number");
  assert.match(String(fields.append_system_prompt), /no shell/);
});

test("the case grants only the read-only tools and Skill, never Bash, a write tool or MCP", () => {
  const prompt = byPath(toNativeCases(file, options)).get("issue-close/merge-fails-stops/prompt.md") ?? "";
  const { fields } = parseFrontmatter(prompt);
  assert.deepEqual(fields.allowed_tools, EVAL_TOOLS);
  assert.deepEqual(EVAL_TOOLS, ["Read", "Glob", "Grep", "Skill"]);
});

test("the frontmatter uses only keys the native prompt.md accepts", () => {
  const allowed = new Set(["schema_version", "name", "description", "tags", "plugins", "runs", "expected_outcome", "model", "max_turns", "timeout_seconds", "allowed_tools", "append_system_prompt", "env"]);
  const prompt = byPath(toNativeCases(file, options)).get("issue-close/merge-fails-stops/prompt.md") ?? "";
  for (const key of Object.keys(parseFrontmatter(prompt).fields)) assert.ok(allowed.has(key), key);
});

test("each assertion becomes an llm grader whose rubric quotes it", () => {
  const files = byPath(toNativeCases(file, options));
  file.evals[0].assertions.forEach((assertion, index) => {
    const grader = files.get(`issue-close/merge-fails-stops/graders/assertion-0${index + 1}.md`) ?? "";
    const { fields, body } = parseFrontmatter(grader);
    assert.deepEqual(fields, { type: "llm" });
    assert.ok(body.includes(assertion));
    assert.match(body, /^PASS if/m);
    assert.match(body, /^FAIL if/m);
  });
});

test("the system prompt sets the sandbox aside, fills unstated results with success and loads skills through Skill", () => {
  assert.match(EVAL_SYSTEM_PROMPT, /empty sandbox/);
  assert.match(EVAL_SYSTEM_PROMPT, /does not state succeeds/);
  assert.match(EVAL_SYSTEM_PROMPT, /Skill tool/);
});

test("every llm grader opens with the judge preamble on adapter operations and steps not run", () => {
  const files = toNativeCases(file, options).filter((item) => !item.path.endsWith("prompt.md") && !item.path.endsWith("skill-fired.md"));
  assert.equal(files.length, 3);
  for (const item of files) assert.ok(parseFrontmatter(item.content).body.startsWith(JUDGE_PREAMBLE), item.path);
  assert.match(JUDGE_PREAMBLE, /whether or not it names the operation/);
  assert.match(JUDGE_PREAMBLE, /did not run, or would skip, does not count as run/);
});

test("the expected output becomes an llm grader on the described outcome", () => {
  const grader = byPath(toNativeCases(file, options)).get("issue-close/merge-fails-stops/graders/outcome.md") ?? "";
  const { fields, body } = parseFrontmatter(grader);
  assert.deepEqual(fields, { type: "llm" });
  assert.ok(body.includes(file.evals[0].expected_output));
});

test("a skill-fired grader checks that the skill under test was invoked", () => {
  const grader = byPath(toNativeCases(file, options)).get("issue-close/merge-fails-stops/graders/skill-fired.md") ?? "";
  const { fields } = parseFrontmatter(grader);
  assert.equal(fields.type, "tool_used");
  assert.equal(fields.tool, "Skill");
  const pattern = new RegExp(String(fields.input_match));
  assert.ok(pattern.test('{"skill":"nerd4rent:issue-close"}'));
  assert.ok(pattern.test('{"skill": "issue-close"}'));
  assert.equal(pattern.test('{"skill":"nerd4rent:issue-close-extra"}'), false);
});

test("an eval without expected output gets no outcome grader", () => {
  const cases = toNativeCases({ ...file, evals: [{ ...file.evals[0], expected_output: " " }] }, options);
  assert.equal(cases.some((item) => item.path.endsWith("outcome.md")), false);
});

test("the plugins path follows the depth of the eval directory", () => {
  const prompt = toNativeCases(file, { evalDir: "cases" })[0].content;
  assert.deepEqual(parseFrontmatter(prompt).fields.plugins, ["../../.."]);
});

test("values that need quoting survive the frontmatter", () => {
  const tricky = "Line: one\n# not a comment\n\"quoted\" and 'single'";
  const cases = toNativeCases({ ...file, evals: [{ ...file.evals[0], expected_output: tricky }] }, options);
  assert.equal(parseFrontmatter(cases[0].content).fields.expected_outcome, tricky);
});

test("an id that is not a plain kebab-case name is refused", () => {
  assert.throws(() => toNativeCases({ ...file, evals: [{ ...file.evals[0], id: "../escape" }] }, options), /id/);
});

test("an eval with fixture files is refused until the converter supports them", () => {
  assert.throws(() => toNativeCases({ ...file, evals: [{ ...file.evals[0], files: ["fixture.md"] }] }, options), /files/);
});

test("an eval directory outside the plugin is refused", () => {
  assert.throws(() => toNativeCases(file, { evalDir: "../outside" }), /evalDir/);
  assert.throws(() => toNativeCases(file, { evalDir: "/tmp/cases" }), /evalDir/);
});
