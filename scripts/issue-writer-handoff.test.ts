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

test("issue-writer handoff repeats the captured ID in the type-it instruction", () => {
  const skill = read(SKILL);
  assert.match(
    skill,
    /Issue utworzone \(DEMO-123\).+Wpisz DEMO-123 w nowej/s,
    `${SKILL} must name DEMO-123 in both the created-issue slot and the type-it instruction`,
  );
  assert.equal(skill.includes(FORBIDDEN), false);
});

test("issue-writer has an eval that requires the captured ID in the type-it instruction", () => {
  const file = JSON.parse(read("skills/issue-writer/evals/evals.json")) as {
    evals: Array<{ id: string; expected_output: string; assertions: string[] }>;
  };
  const handoff = file.evals.find((evalCase) => evalCase.id === "handoff-repeats-created-id");
  assert.ok(handoff, "evals.json has handoff-repeats-created-id");
  const body = [handoff.expected_output, ...handoff.assertions].join("\n");
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
