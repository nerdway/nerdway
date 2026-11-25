import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadCoreChecks } from "../lib/setup-checks.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillPath = join(repoRoot, "skills", "nerdway-setup", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");
const coreIds = loadCoreChecks(repoRoot).checks.map((check) => check.id);
const RUNNER = ["scripts/setup-state.ts", "scripts/lib/setup-state.ts", "scripts/lib/setup-checks.ts", "scripts/project-config.ts"];

function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? "");
}

test("SKILL.md names no check id: it works only from the registry", () => {
  assert.ok(coreIds.length > 0);
  const spans = codeSpans(skill);
  const named = coreIds.filter((id) => spans.some((span) => span === id || span.split(/\s+/).includes(id)));
  assert.deepEqual(named, []);
});

test("the runner names no check id", () => {
  for (const path of RUNNER) {
    const text = readFileSync(join(repoRoot, path), "utf8");
    const named = coreIds.filter((id) => text.includes(`"${id}"`) || text.includes(`'${id}'`) || text.includes(`\`${id}\``));
    assert.deepEqual(named, [], path);
  }
});

test("SKILL.md contains no tracker, VCS or install command of its own", () => {
  const commands = [/(^|[\s`(])gh\s/m, /(^|[\s`(])glab\s/m, /(^|[\s`(])acli\s/m, /az boards/, /linearis/, /brew install/, /npm install -g/];
  for (const command of commands) assert.doesNotMatch(skill, command);
});

test("SKILL.md documents preflight and the host ask tools in grill's order", () => {
  assert.match(skill, /preflight --caller/);
  const order = ["AskUserQuestion", "AskQuestion", "request_user_input"].map((name) => skill.indexOf(name));
  assert.ok(order.every((at) => at !== -1));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("the skill folder holds only nerdway's own files: the skill, the core registry and evals", () => {
  const dir = join(repoRoot, "skills", "nerdway-setup");
  assert.deepEqual(readdirSync(dir).sort(), ["SKILL.md", "checks.json", "evals"]);
  assert.equal(existsSync(join(dir, "config.yml")), false);
});

test("every hand-off in the core registry names a skill the SKILL.md lists as related", () => {
  for (const check of loadCoreChecks(repoRoot).checks) {
    if (check.handoff !== undefined) assert.match(skill, new RegExp(`nerdway:${check.handoff}\\b`), check.handoff);
  }
});
