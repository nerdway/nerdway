import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  mentionsPlatform,
  PLATFORM_RECIPE,
  platformReaders,
  platformReferenceErrors,
  validatePlatformReferences,
} from "./platform-references.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("mentionsPlatform: an inline `## Platform` is a mention", () => {
  assert.equal(mentionsPlatform("Take it from the `## Platform` section of the repo `CLAUDE.md`."), true);
  assert.equal(mentionsPlatform("repo\n`CLAUDE.md` `## Platform` → entity page"), true);
});

test("mentionsPlatform: a skill's own line-start heading is not a mention", () => {
  assert.equal(mentionsPlatform("# Skill\n\n## Platform and adapters\n\nTracker commands live in adapters."), false);
  assert.equal(mentionsPlatform("## Platform\n\nprose"), false);
  assert.equal(mentionsPlatform("Mentions `## Platform and adapters` inline."), false);
});

test("mentionsPlatform: a line-start heading inside a code fence is a mention", () => {
  assert.equal(mentionsPlatform("```markdown\n## Platform\n\ntracker: linear\n```"), true);
});

test("platformReferenceErrors: a mention without the shared recipe fails", () => {
  const errors = platformReferenceErrors([{ path: "skills/x/SKILL.md", source: "1. the `## Platform` section of the repo `CLAUDE.md`;" }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /skills\/x\/SKILL\.md/);
  assert.match(errors[0], /adapters\/platform\.md/);
});

test("platformReferenceErrors: a mention with the shared recipe passes, and so does a file without a mention", () => {
  assert.deepEqual(
    platformReferenceErrors([
      { path: "skills/x/SKILL.md", source: "the `## Platform` section, read from disk as `${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes" },
      { path: "skills/y/SKILL.md", source: "## Platform and adapters\n\nNo platform reading here." },
    ]),
    [],
  );
});

test("platformReferenceErrors: wording that assumes CLAUDE.md in context fails even with the recipe", () => {
  const source = `see ${PLATFORM_RECIPE}; the calling skill takes the platform from this output, not from its own copy of \`CLAUDE.md\`.`;
  const errors = platformReferenceErrors([{ path: "skills/x/SKILL.md", source }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /own copy of `CLAUDE\.md/);
  assert.match(platformReferenceErrors([{ path: "a.md", source: "The repo `CLAUDE.md` is not reloaded mid-session, so take it from here." }])[0], /context model/);
  assert.match(platformReferenceErrors([{ path: "a.md", source: "CLAUDE.md is already in context." }])[0], /in context/);
});

test("platformReferenceErrors: the recipe itself is exempt", () => {
  assert.deepEqual(platformReferenceErrors([{ path: PLATFORM_RECIPE, source: "never rely on its own copy of `CLAUDE.md`; `## Platform`" }]), []);
});

test("platformReaders covers every skill, agent and adapter of this repo", () => {
  const paths = platformReaders(repoRoot).map((file) => file.path);
  assert.ok(paths.includes("skills/issue-start/SKILL.md"));
  assert.ok(paths.includes("adapters/statuses.md"));
  assert.ok(paths.includes(PLATFORM_RECIPE));
  assert.ok(paths.some((path) => path.startsWith("agents/")));
  assert.ok(!paths.includes("skills/nerdbrain-wiki/entity-page-template.md"));
});

test("this repo: every skill that mentions `## Platform` points at the shared recipe", () => {
  assert.deepEqual(validatePlatformReferences(repoRoot), []);
});
