import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { READINESS_MARKER, classifyPrBody } from "./lib/pr-body.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const TEMPLATE = "skills/issue-workflow/readiness-description-template.md";
const SECTIONS = ["Why", "What changed", "Scope", "Evidence", "Merge risk", "After merge"];
const trackerNames = ["linear", "jira", "linearis", "claude", "cursor"];

function body(): string {
  const text = read(TEMPLATE);
  const match = /## Body\n\n```markdown\n([\s\S]*?)\n```/.exec(text);
  assert.ok(match, "the template has a ## Body section with one markdown block");
  return match[1];
}

test("the body opens with the Fixes line and ends with the marker", () => {
  const lines = body().split("\n");
  assert.equal(lines[0], "Fixes <ID>");
  assert.equal(lines.at(-1), READINESS_MARKER);
  assert.equal(classifyPrBody(body()), "readiness");
});

test("the body has every section, in order", () => {
  const headings = body()
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3));
  assert.deepEqual(headings, SECTIONS);
});

test("the sections table describes the same sections, in the same order", () => {
  const rows = read(TEMPLATE)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Section") && !line.startsWith("| <"))
    .map((line) => line.split("|")[1].trim())
    .filter((name) => SECTIONS.includes(name));
  assert.deepEqual(rows, SECTIONS);
});

test("the evidence is the Criteria verification table", () => {
  assert.match(body(), /## Evidence\n\n\| Criterion \| Check \| Result \| Evidence \|\n/);
});

test("merge risk names the door and the blast radius", () => {
  const text = read(TEMPLATE);
  assert.match(text, /one-way/);
  assert.match(text, /two-way/);
  assert.match(text, /blast radius/);
});

test("after merge is the only optional section", () => {
  assert.match(read(TEMPLATE), /Every section is required except\s+After merge/);
});

test("the body carries no issue code and no tracker or assistant name", () => {
  const text = body();
  assert.doesNotMatch(text, /\b[A-Z][A-Z0-9]+-\d+\b/);
  assert.doesNotMatch(text, /(^|\s)#\d+\b/);
  for (const name of trackerNames) {
    assert.equal(text.toLowerCase().includes(name), false, name);
  }
});

function step6b(): string {
  const text = read("skills/issue-workflow/SKILL.md");
  const match = /### 6b\. Write the readiness description\n([\s\S]*?)\n### /.exec(text);
  assert.ok(match, "issue-workflow has step 6b");
  return match[1];
}

test("issue-workflow step 6b points at the template instead of copying it", () => {
  const step = step6b();
  assert.match(step, /readiness-description-template\.md/);
  assert.doesNotMatch(step, /blast radius|## Merge risk/);
});

test("issue-workflow step 6b classifies the description, then edits it or comments", () => {
  const step = step6b();
  assert.match(step, /scripts\/pr-body-state\.ts/);
  assert.match(step, /`draft` or `readiness` → run\s+`pr\.edit-body`/);
  assert.match(step, /`manual` → leave the description as it is,\s+post the file with `pr\.comment`/);
  assert.ok(step.includes(READINESS_MARKER));
});

test("issue-workflow step 6b shortens the evidence over the platform limit", () => {
  const step = step6b();
  assert.match(step, /limit/);
  assert.match(step, /`fail` rows and the key criteria/);
  assert.match(step, /full table\s+with `pr\.comment`/);
});

test("auto-issue-mode writes the readiness description through step 6b before pr.mark-ready", () => {
  const text = read("skills/auto-issue-mode/SKILL.md");
  const stage = /4\. \*\*Review\.\*\*([\s\S]*?)\n5\. \*\*Close-out\.\*\*/.exec(text)?.[1] ?? "";
  const write = stage.indexOf("readiness description exactly as `issue-workflow`\n   step 6b");
  const ready = stage.indexOf("`pr.mark-ready`");
  assert.ok(write > 0, "stage 4 points at step 6b");
  assert.ok(ready > write, "the readiness description comes before pr.mark-ready");
  assert.equal(text.includes(READINESS_MARKER), false);
  assert.doesNotMatch(text, /blast radius|## Merge risk|readiness-description-template/);
});
