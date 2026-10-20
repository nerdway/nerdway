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
