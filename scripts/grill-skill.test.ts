import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { sectionBody, tableRows } from "./types/workflow-graph.ts";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const SKILL = "skills/grill/SKILL.md";
const REFERENCE = "skills/grill/reference.md";
const SKILL_BUDGET_BYTES = 11_000;
const VOICE_HEADING = "Voice: developer to developer";
const INTERNAL_PHRASES = [
  ["frontier"],
  ["round", "runda"],
  ["fold in"],
  ["resolved branch"],
  ["carrier"],
  ["state block", "blok stanu"],
  ["recommendation accepted"],
  ["question number"],
  ["acceptance-criterion position"],
];

function voiceRows(): string[][] {
  const body = sectionBody(read(REFERENCE), VOICE_HEADING);
  assert.ok(body !== undefined, `${REFERENCE} has a ## ${VOICE_HEADING} section`);
  return tableRows(body);
}

function stateTemplate(): string {
  const match = /```\n(## Grill state\n[\s\S]*?)\n```/.exec(read(REFERENCE));
  assert.ok(match, `${REFERENCE} has a fenced block that opens with ## Grill state`);
  return match[1];
}

test("SKILL.md stays within the ~10 KB runtime budget", () => {
  const bytes = Buffer.byteLength(read(SKILL));
  assert.ok(
    bytes <= SKILL_BUDGET_BYTES,
    `${SKILL} is ${bytes} bytes; keep the runtime file at most ${SKILL_BUDGET_BYTES} after moving reference material`,
  );
});

test("no frontier or round in the runtime skill", () => {
  const offenders = read(SKILL)
    .split("\n")
    .filter((line) => /\bfrontier\b|\brounds?\b/i.test(line));
  assert.deepEqual(offenders, []);
});

test("no frontier or round outside the voice section of the reference", () => {
  const lines = read(REFERENCE).split("\n");
  const start = lines.indexOf(`## ${VOICE_HEADING}`);
  assert.ok(start !== -1, `${REFERENCE} has a ## ${VOICE_HEADING} section`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const outside = [...lines.slice(0, start), ...(end === -1 ? [] : lines.slice(end))];
  const offenders = outside.filter((line) => /\bfrontier\b|\brounds?\b/i.test(line));
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

test("the question prefers a native ask tool and falls back to a numbered list", () => {
  const text = read(SKILL).replace(/\s+/g, " ");
  assert.match(text, /`AskUserQuestion`/);
  assert.match(text, /ask-question/);
  assert.match(text, /numbered list/);
  assert.match(text, /"tak", "yes" or "1"/);
});

test("option quality forbids a strawman third option and caps the header at 12 characters", () => {
  const text = read(SKILL).replace(/\s+/g, " ");
  assert.match(text, /Two options are enough/);
  assert.match(text, /12 characters/);
  assert.match(text, /mutually exclusive/);
  assert.match(text, /only one path is sensible/);
  assert.match(text, /no preference/);
});

test("a synthetic host skip is not a user decision", () => {
  assert.match(read(SKILL), /Questions skipped by the user/);
  assert.match(read(SKILL), /not an\nanswer|not an answer/);
});

test("vague answers escalate twice and the session stays on the current branch", () => {
  const text = read(SKILL);
  assert.match(text, /Vague once/);
  assert.match(text, /Vague twice/);
  assert.match(text, /stay on that branch/);
});

test("without an issue chat gets a compact note, not the full block", () => {
  const text = read(SKILL);
  assert.match(text, /compact note/);
  assert.match(text, /Do not print\n  the full `## Grill state` block except/);
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

test("a bound issue upserts one living Grill decisions checklist", () => {
  const skill = read(SKILL);
  const reference = read(REFERENCE);
  assert.match(skill, /## Grill decisions/);
  assert.match(skill, /Tracker edits win/);
  assert.match(reference, /- \[x\] /);
  assert.match(reference, /- \[ \] /);
  assert.match(reference, /source of truth/);
});

const OUTCOME_HEADING = "5. End on shared understanding";

function outcomeSection(): string {
  const body = sectionBody(read(SKILL), OUTCOME_HEADING);
  assert.ok(body !== undefined, `${SKILL} has a ## ${OUTCOME_HEADING} section`);
  return body.replace(/\s+/g, " ");
}

test("the outcome is a developer briefing in the conversation language, not a plain list", () => {
  const text = outcomeSection();
  assert.doesNotMatch(text, /plain list/);
  assert.match(text, /briefing for a fellow developer/);
  assert.match(text, /conversation language/);
  assert.match(text, /what happened, with a concrete example/);
  assert.match(text, /the cause/);
  assert.match(text, /what will change/);
  assert.match(text, /what is deliberately left out/);
});

test("the docs tags and the confirmation menu follow the briefing", () => {
  const text = outcomeSection();
  const briefing = text.indexOf("briefing for a fellow developer");
  const tags = text.indexOf("docs-discipline tag");
  const menu = text.indexOf("confirmation menu");
  assert.ok(briefing !== -1 && tags !== -1 && menu !== -1, "briefing, tags and menu are all named");
  assert.ok(briefing < tags && tags < menu, "briefing, then tags, then menu");
});

test("resuming a confirmed session prints the section 5 briefing", () => {
  const entry = sectionBody(read(SKILL), "Entry: resume or start");
  assert.ok(entry !== undefined);
  assert.match(entry.replace(/\s+/g, " "), /`yes` → print the outcome as section 5 gives it/);
});

const EVALS = "skills/grill/evals/evals.json";

type EvalCase = { id: string; prompt: string; expected_output: string; assertions: string[] };

function evalCases(): EvalCase[] {
  return JSON.parse(read(EVALS)).evals;
}

test("the evals cover one question at a time, resuming, option quality, a synthetic skip and the checklist", () => {
  const ids = evalCases().map((evalCase) => evalCase.id);
  assert.ok(ids.includes("three-decisions-one-at-a-time"));
  assert.ok(ids.includes("resume-from-grill-state"));
  assert.ok(ids.includes("option-quality"));
  assert.ok(ids.includes("synthetic-skip"));
  assert.ok(ids.includes("checklist-checkpoint"));
  assert.ok(!ids.includes("three-decisions-two-rounds"));
});

const FORBIDS_INTERNAL_PHRASES = /^None of the internal phrases/;

test("no eval prompt, expected output or assertion speaks of rounds, except to forbid the word", () => {
  const offenders = evalCases().flatMap((evalCase) =>
    [evalCase.prompt, evalCase.expected_output, ...evalCase.assertions]
      .filter((text) => /\brounds?\b/i.test(text) && !FORBIDS_INTERNAL_PHRASES.test(text))
      .map((text) => `${evalCase.id}: ${text.slice(0, 80)}`),
  );
  assert.deepEqual(offenders, []);
});

test("the resume eval pastes a block saved after a single question", () => {
  const resume = evalCases().find((evalCase) => evalCase.id === "resume-from-grill-state");
  assert.ok(resume);
  assert.match(resume.prompt, /### Next question\n/);
  assert.doesNotMatch(resume.prompt, /^Round:/m);
});

test("the option-quality eval forbids a strawman third option", () => {
  const optionQuality = evalCases().find((evalCase) => evalCase.id === "option-quality");
  assert.ok(optionQuality);
  assert.match(optionQuality.prompt, /CSV or TSV/);
  assert.match(optionQuality.assertions.join("\n"), /two options/);
});

test("the synthetic-skip eval treats host skip text as not shown", () => {
  const syntheticSkip = evalCases().find((evalCase) => evalCase.id === "synthetic-skip");
  assert.ok(syntheticSkip);
  assert.match(syntheticSkip.prompt, /Questions skipped by the user/);
  assert.match(syntheticSkip.assertions.join("\n"), /numbered list/);
});

test("the checklist eval treats tracker edits as the source of truth", () => {
  const checklist = evalCases().find((evalCase) => evalCase.id === "checklist-checkpoint");
  assert.ok(checklist);
  assert.match(checklist.prompt, /## Grill decisions/);
  assert.match(checklist.assertions.join("\n"), /source of truth|checklist/);
});
