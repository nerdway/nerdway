import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readFrontmatter,
  validateComponentsForClaudeAi,
  validatePluginForClaudeAi,
  type ClaudeAiManifests,
  type ComponentFile,
} from "./claude-ai.ts";

const DESCRIPTION = "Daily developer workflow automation.";

function manifests(overrides: Partial<ClaudeAiManifests> = {}): ClaudeAiManifests {
  return {
    claudePlugin: { name: "nerd4rent", description: DESCRIPTION },
    marketplace: { plugins: [{ name: "nerd4rent", description: DESCRIPTION }] },
    cursorPlugin: { name: "nerd4rent", displayName: "nerd4rent", description: DESCRIPTION },
    cursorMarketplace: { plugins: [{ name: "nerd4rent", description: DESCRIPTION }] },
    ...overrides,
  };
}

function skill(name: string, description: string, path = `skills/${name}/SKILL.md`): ComponentFile {
  return { path, text: `---\nname: ${name}\ndescription: >-\n  ${description}\n---\n\n# Body with <ID>\n` };
}

function agent(name: string, description: string): ComponentFile {
  return { path: `agents/${name}.md`, text: `---\nname: ${name}\ndescription: ${description}\ntools: Read\n---\n` };
}

test("readFrontmatter reads plain, quoted and folded block values", () => {
  const { fields, error } = readFrontmatter(
    '---\nname: issue-start\nmodel: "haiku"\ndescription: >-\n  first line\n  second line\nskills:\n  - nerdbrain-search\n---\nbody\n',
  );
  assert.equal(error, undefined);
  assert.equal(fields.name, "issue-start");
  assert.equal(fields.model, "haiku");
  assert.equal(fields.description, "first line second line");
});

test("readFrontmatter reports a file without frontmatter", () => {
  assert.match(readFrontmatter("# no frontmatter\n").error ?? "", /no YAML frontmatter/);
  assert.match(readFrontmatter("---\nname: x\n").error ?? "", /not closed/);
});

test("accepts plugin manifests within claude.ai's limits", () => {
  assert.deepEqual(validatePluginForClaudeAi(manifests()), []);
});

test("rejects a plugin description longer than 500 characters", () => {
  const long = "x".repeat(501);
  const errors = validatePluginForClaudeAi(manifests({ claudePlugin: { name: "nerd4rent", description: long } }));
  assert.ok(errors.some((error) => error.startsWith(".claude-plugin/plugin.json:") && /501 characters/.test(error)));
});

test("accepts a plugin description of exactly 500 characters", () => {
  const exact = "x".repeat(500);
  const entry = [{ name: "nerd4rent", description: exact }];
  const errors = validatePluginForClaudeAi({
    claudePlugin: { name: "nerd4rent", description: exact },
    marketplace: { plugins: entry },
    cursorPlugin: { name: "nerd4rent", description: exact },
    cursorMarketplace: { plugins: entry },
  });
  assert.deepEqual(errors, []);
});

test("rejects a long description in the marketplace entry and the Cursor manifests", () => {
  const long = "y".repeat(555);
  const entry = { plugins: [{ name: "nerd4rent", description: long }] };
  const errors = validatePluginForClaudeAi(
    manifests({ marketplace: entry, cursorMarketplace: entry, cursorPlugin: { name: "nerd4rent", description: long } }),
  );
  assert.ok(errors.some((error) => error.startsWith(".claude-plugin/marketplace.json plugins[nerd4rent]") && /555/.test(error)));
  assert.ok(errors.some((error) => error.startsWith(".cursor-plugin/plugin.json") && /555/.test(error)));
  assert.ok(errors.some((error) => error.startsWith(".cursor-plugin/marketplace.json plugins[nerd4rent]") && /555/.test(error)));
});

test("rejects plugin descriptions that drift apart", () => {
  const errors = validatePluginForClaudeAi(
    manifests({ cursorPlugin: { name: "nerd4rent", description: "Something else." } }),
  );
  assert.ok(errors.some((error) => /\.cursor-plugin\/plugin\.json: description differs/.test(error)));
});

test("rejects a missing plugin description", () => {
  const errors = validatePluginForClaudeAi(manifests({ claudePlugin: { name: "nerd4rent" } }));
  assert.ok(errors.some((error) => error === ".claude-plugin/plugin.json: description is missing"));
});

test("rejects a plugin name claude.ai does not accept", () => {
  for (const name of ["Nerd4rent", "nerd_4rent", "nerd 4rent", "n".repeat(65)]) {
    const errors = validatePluginForClaudeAi(manifests({ claudePlugin: { name, description: DESCRIPTION } }));
    assert.ok(errors.some((error) => error.startsWith(".claude-plugin/plugin.json: name")), name);
  }
});

test("rejects a Claude Code displayName longer than 64 characters", () => {
  const errors = validatePluginForClaudeAi(
    manifests({ claudePlugin: { name: "nerd4rent", displayName: "d".repeat(65), description: DESCRIPTION } }),
  );
  assert.ok(errors.some((error) => /displayName/.test(error)));
});

test("accepts skills and agents without angle brackets in name or description", () => {
  const errors = validateComponentsForClaudeAi(
    [skill("issue-start", "Open a draft PR carrying the Fixes magic word followed by the issue ID.")],
    [agent("review-mapper", "One axis mapper of the review-verify island.")],
  );
  assert.deepEqual(errors, []);
});

test("angle brackets in a skill body are not a description problem", () => {
  assert.deepEqual(validateComponentsForClaudeAi([skill("issue-start", "Start an issue.")], []), []);
});

test("rejects angle brackets in a skill description", () => {
  const errors = validateComponentsForClaudeAi([skill("issue-start", "carrying the `Fixes <ID>` magic word")], []);
  assert.ok(errors.some((error) => error.startsWith("skills/issue-start/SKILL.md: description contains")));
});

test("rejects a lone angle bracket in a skill description", () => {
  const errors = validateComponentsForClaudeAi([skill("nerdbrain-wiki", "pages under 5-wiki -> entities")], []);
  assert.ok(errors.some((error) => /description contains/.test(error)));
});

test("rejects angle brackets in an agent description", () => {
  const errors = validateComponentsForClaudeAi([], [agent("plan-gatherer", "Reads <slug> pages.")]);
  assert.ok(errors.some((error) => error.startsWith("agents/plan-gatherer.md: description contains")));
});

test("rejects a skill description longer than 1024 characters", () => {
  const errors = validateComponentsForClaudeAi([skill("issue-start", "z".repeat(1025))], []);
  assert.ok(errors.some((error) => /1025 characters/.test(error)));
});

test("rejects a skill or agent without name or description", () => {
  const errors = validateComponentsForClaudeAi(
    [{ path: "skills/x/SKILL.md", text: "---\nname: x\n---\n" }],
    [{ path: "agents/y.md", text: "---\ndescription: An agent.\n---\n" }],
  );
  assert.ok(errors.includes("skills/x/SKILL.md: description is missing"));
  assert.ok(errors.includes("agents/y.md: name is missing"));
});

test("rejects a skill name with uppercase letters, underscores or a reserved word", () => {
  const errors = validateComponentsForClaudeAi(
    [skill("Issue_Start", "Start."), skill("claude-helper", "Help.")],
    [],
  );
  assert.ok(errors.some((error) => /name "Issue_Start" may hold only/.test(error)));
  assert.ok(errors.some((error) => /reserved word "claude"/.test(error)));
});

test("rejects two skills sharing a name", () => {
  const errors = validateComponentsForClaudeAi(
    [skill("issue-start", "One.", "skills/a/SKILL.md"), skill("issue-start", "Two.", "skills/b/SKILL.md")],
    [],
  );
  assert.ok(errors.some((error) => /skills\/b\/SKILL\.md: skill name "issue-start" is already used by skills\/a\/SKILL\.md/.test(error)));
});

test("rejects a component file without frontmatter", () => {
  const errors = validateComponentsForClaudeAi([{ path: "skills/x/SKILL.md", text: "# x\n" }], []);
  assert.ok(errors.some((error) => /skills\/x\/SKILL\.md: no YAML frontmatter/.test(error)));
});
