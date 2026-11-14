import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { READINESS_MARKER, classifyPrBody } from "./lib/pr-body.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const TEMPLATE = "skills/issue-workflow/readiness-description-template.md";
const COLLAPSED_SECTIONS = ["Summary", "Why", "What changed", "Scope", "Evidence", "Merge risk", "After merge"];
const FLAT_SECTIONS = ["Why", "What changed", "Scope", "Evidence", "Merge risk", "After merge"];
const trackerNames = ["linear", "jira", "linearis", "claude", "cursor"];

function body(heading: string): string {
  const text = read(TEMPLATE);
  const match = new RegExp(`## ${heading}\\n\\n[\\s\\S]*?\`\`\`markdown\\n([\\s\\S]*?)\\n\`\`\``).exec(text);
  assert.ok(match, `the template has a ## ${heading} section with one markdown block`);
  return match[1];
}

function collapsed(): string {
  return body("Body \\(collapsed\\)");
}

function flat(): string {
  return body("Body \\(flat\\)");
}

function headingsOf(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3));
}

test("the collapsed body opens with the Fixes line, then Summary, and ends with the marker", () => {
  const text = collapsed();
  const lines = text.split("\n");
  assert.equal(lines[0], "Fixes <ID>");
  assert.equal(lines.at(-1), READINESS_MARKER);
  assert.match(text, /^Fixes <ID>\n\n## Summary\n/);
  assert.equal(classifyPrBody(text), "readiness");
});

test("the collapsed Details block wraps the five sections and leaves After merge outside", () => {
  const text = collapsed();
  const details = /<details>\n<summary>Details<\/summary>\n\n([\s\S]*?)\n\n<\/details>/.exec(text);
  assert.ok(details, "collapsed body has a Details block with blank lines after summary and before close");
  assert.deepEqual(headingsOf(details[1]), ["Why", "What changed", "Scope", "Evidence", "Merge risk"]);
  const after = text.indexOf("</details>");
  const afterMerge = text.indexOf("## After merge");
  const marker = text.indexOf(READINESS_MARKER);
  assert.ok(afterMerge > after, "After merge is below the Details block");
  assert.ok(marker > afterMerge, "the marker is last");
});

test("the collapsed body has every section, in order", () => {
  assert.deepEqual(headingsOf(collapsed()), COLLAPSED_SECTIONS);
});

test("the flat body is today's layout: no Summary, no Details, same sections as before", () => {
  const text = flat();
  const lines = text.split("\n");
  assert.equal(lines[0], "Fixes <ID>");
  assert.equal(lines.at(-1), READINESS_MARKER);
  assert.doesNotMatch(text, /## Summary/);
  assert.doesNotMatch(text, /<details>/);
  assert.deepEqual(headingsOf(text), FLAT_SECTIONS);
  assert.equal(classifyPrBody(text), "readiness");
});

test("the sections table describes the same sections, Summary first", () => {
  const rows = read(TEMPLATE)
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Section") && !line.startsWith("| <"))
    .map((line) => line.split("|")[1].trim())
    .filter((name) => COLLAPSED_SECTIONS.includes(name));
  assert.deepEqual(rows, COLLAPSED_SECTIONS);
});

test("the evidence is the Criteria verification table in both bodies", () => {
  assert.match(collapsed(), /## Evidence\n\n\| Criterion \| Check \| Result \| Evidence \|\n/);
  assert.match(flat(), /## Evidence\n\n\| Criterion \| Check \| Result \| Evidence \|\n/);
});

test("merge risk names the door and the blast radius", () => {
  const text = read(TEMPLATE);
  assert.match(text, /one-way/);
  assert.match(text, /two-way/);
  assert.match(text, /blast radius/);
});

test("after merge is the only optional section", () => {
  assert.match(read(TEMPLATE), /except After merge/);
});

test("the bodies carry no issue code and no tracker, model or assistant name", () => {
  for (const text of [collapsed(), flat()]) {
    assert.doesNotMatch(text, /\b[A-Z][A-Z0-9]+-\d+\b/);
    assert.doesNotMatch(text, /(^|\s)#\d+\b/);
    for (const name of trackerNames) {
      assert.equal(text.toLowerCase().includes(name), false, name);
    }
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

test("issue-workflow step 6b reads pr.collapse_details before writing", () => {
  const step = step6b();
  assert.match(step, /pr\.collapse_details/);
  assert.match(step, /validate-platform-config\.ts --print pr\.collapse_details/);
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

test("issue-close stops on the start draft through the classifier and writes no description", () => {
  const text = read("skills/issue-close/SKILL.md");
  const step = /## Step 0c — Readiness description check \(gate\)\n([\s\S]*?)\n## Step 1/.exec(text)?.[1] ?? "";
  assert.match(step, /scripts\/pr-body-state\.ts/);
  assert.match(step, /`draft` → stop — commit, push and merge nothing/);
  assert.match(step, /`readiness`[\s\S]*or `manual`[\s\S]*go\s+to Step 1/);
  assert.doesNotMatch(text, /pr\.edit-body|pr\.comment/);
});
