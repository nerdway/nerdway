import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const FORBIDDEN = "Wpisz ID issue";
const SKILL = "skills/issue-writer/SKILL.md";
const THIS_TEST = "scripts/issue-writer-handoff.test.ts";

test("issue-writer handoff formats the created issue as a clickable link and repeats the captured ID in the type-it instruction", () => {
  const skill = read(SKILL);
  assert.match(
    skill,
    /Issue utworzone: \[DEMO-123\]\(<url>\).+Wpisz DEMO-123 w nowej/s,
    `${SKILL} must format DEMO-123 as [DEMO-123](<url>) in the created-issue slot and keep DEMO-123 in the type-it instruction`,
  );
  assert.equal(skill.includes("Issue utworzone (DEMO-123) — w Backlogu: <link>"), false);
  assert.equal(skill.includes(FORBIDDEN), false);
});

test("issue-writer has an eval that requires a clickable link and the captured ID in the type-it instruction", () => {
  const file = JSON.parse(read("skills/issue-writer/evals/evals.json")) as {
    evals: Array<{ id: string; expected_output: string; assertions: string[] }>;
  };
  const handoff = file.evals.find((evalCase) => evalCase.id === "handoff-repeats-created-id");
  assert.ok(handoff, "evals.json has handoff-repeats-created-id");
  const body = [handoff.expected_output, ...handoff.assertions].join("\n");
  assert.match(body, /\[DEMO-501\]\(https:\/\/linear\.app\/example\/issue\/DEMO-501\/modal-faktury-aktywuje-basic\)/);
  assert.match(body, /Wpisz DEMO-501/);
  assert.equal(body.includes(FORBIDDEN), false);
});

test("no tracked plugin file uses the generic type-it phrase", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "" && path !== THIS_TEST);
  const offenders = files.filter((path) => read(path).includes(FORBIDDEN));
  assert.deepEqual(offenders, [], `${FORBIDDEN} must not appear outside ${THIS_TEST}`);
});
