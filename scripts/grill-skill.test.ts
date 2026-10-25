import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { sectionBody, tableRows } from "./types/workflow-graph.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const SKILL = "skills/grill/SKILL.md";
const VOICE_HEADING = "6. Voice: developer to developer";
const INTERNAL_PHRASES = [
  ["frontier"],
  ["round", "runda"],
  ["fold in"],
  ["resolved branch"],
  ["carrier"],
  ["state block", "blok stanu"],
  ["recommendation accepted"],
];

function linesOutsideVoiceSection(): string[] {
  const lines = read(SKILL).split("\n");
  const start = lines.indexOf(`## ${VOICE_HEADING}`);
  assert.ok(start !== -1, `${SKILL} has a ## ${VOICE_HEADING} section`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return [...lines.slice(0, start), ...(end === -1 ? [] : lines.slice(end))];
}

function voiceRows(): string[][] {
  const body = sectionBody(read(SKILL), VOICE_HEADING);
  assert.ok(body !== undefined, `${SKILL} has a ## ${VOICE_HEADING} section`);
  return tableRows(body);
}

function stateTemplate(): string {
  const match = /```\n(## Grill state\n[\s\S]*?)\n```/.exec(read(SKILL));
  assert.ok(match, `${SKILL} has a fenced block that opens with ## Grill state`);
  return match[1];
}

test("no frontier or round outside the voice section", () => {
  const offenders = linesOutsideVoiceSection().filter((line) => /frontier|round/i.test(line));
  assert.deepEqual(offenders, []);
});

for (const forms of INTERNAL_PHRASES) {
  test(`the voice section gives "${forms.join(" / ")}" a before and an after example`, () => {
    const row = voiceRows().find((cells) => forms.every((form) => cells[0].toLowerCase().includes(form)));
    assert.ok(row, `a row whose phrase cell names ${forms.join(" and ")}`);
    assert.equal(row.length, 3, "phrase, before, after");
    assert.ok(row[1].length > 0 && row[2].length > 0, "both examples are filled in");
  });
}

test("the question goes through AskUserQuestion with at most three options", () => {
  const text = read(SKILL);
  assert.match(text, /`AskUserQuestion`/);
  assert.match(text, /three options/);
});

test("without AskUserQuestion the question is a numbered list where tak, yes or 1 picks the recommendation", () => {
  const text = read(SKILL);
  assert.match(text, /numbered list/);
  assert.match(text, /"tak", "yes" or "1"/);
});

test("the state template opens with the heading, ends with the next question and has no Status or Round line", () => {
  const lines = stateTemplate().split("\n");
  assert.equal(lines[0], "## Grill state");
  assert.ok(lines.includes("### Next question"));
  assert.deepEqual(
    lines.filter((line) => /^(Status|Round):/.test(line)),
    [],
  );
});

test("with an issue the state goes to issue.comment after every answer", () => {
  assert.match(read(SKILL), /`issue: <ID>` → `issue\.comment`/);
  assert.match(read(SKILL), /after every answer/);
});
