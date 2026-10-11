import { test } from "node:test";
import assert from "node:assert/strict";

import { detectVersionDrift, findStaleSkillCopies } from "./install-check.ts";

const CURRENT_SKILLS = ["issue-workflow", "nerdbrain-wiki", "tdd"];

function skillMd(name: string, body: string): string {
  return `---\nname: ${name}\ndescription: whatever\n---\n\n${body}\n`;
}

test("detectVersionDrift reports an installed version lower than main", () => {
  assert.deepEqual(detectVersionDrift("0.45.0", "0.51.0"), {
    kind: "version-drift",
    installed: "0.45.0",
    main: "0.51.0",
  });
});

test("detectVersionDrift stays silent when installed equals main", () => {
  assert.equal(detectVersionDrift("0.54.0", "0.54.0"), null);
});

test("detectVersionDrift stays silent when installed is ahead of main (working tree, branch)", () => {
  assert.equal(detectVersionDrift("0.55.0", "0.54.0"), null);
});

test("detectVersionDrift stays silent when main is unknown", () => {
  assert.equal(detectVersionDrift("0.54.0", null), null);
});

test("findStaleSkillCopies flags a directory whose SKILL.md carries a historical plugin skill name", () => {
  const entries = [
    { path: "/home/u/.agents/skills/linear-issue-workflow", text: skillMd("linear-issue-workflow", "Drive a Linear issue.") },
  ];
  assert.deepEqual(findStaleSkillCopies(entries, CURRENT_SKILLS), [
    { kind: "stale-skill-copy", path: "/home/u/.agents/skills/linear-issue-workflow", name: "linear-issue-workflow" },
  ]);
});

test("findStaleSkillCopies flags a current skill name only when the file mentions nerd4rent or nerdbrain", () => {
  const entries = [
    { path: "/home/u/.agents/skills/nerdbrain-wiki", text: skillMd("nerdbrain-wiki", "Write the nerdbrain entity page.") },
    { path: "/home/u/.agents/skills/tdd", text: skillMd("tdd", "Red, green, refactor.") },
    { path: "/home/u/.agents/skills/issue-workflow", text: skillMd("issue-workflow", "Call nerd4rent:issue-start.") },
  ];
  assert.deepEqual(findStaleSkillCopies(entries, CURRENT_SKILLS), [
    { kind: "stale-skill-copy", path: "/home/u/.agents/skills/nerdbrain-wiki", name: "nerdbrain-wiki" },
    { kind: "stale-skill-copy", path: "/home/u/.agents/skills/issue-workflow", name: "issue-workflow" },
  ]);
});

test("findStaleSkillCopies ignores unrelated skills and files without a frontmatter name", () => {
  const entries = [
    { path: "/home/u/.claude/skills/pdf", text: skillMd("pdf", "Read PDFs for nerd4rent clients.") },
    { path: "/home/u/.claude/skills/broken", text: "no frontmatter here, nerdbrain mentioned" },
  ];
  assert.deepEqual(findStaleSkillCopies(entries, CURRENT_SKILLS), []);
});
