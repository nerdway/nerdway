import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { contextTermErrors, contextTermSources, languageTerms } from "./context-terms.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const context = [
  "# repo",
  "",
  "## Language",
  "",
  "**Vault**:",
  "The nerdbrain Obsidian vault.",
  "_Avoid_: notes folder",
  "",
  "**Island host**:",
  "The client machinery that realises an island.",
  "_Avoid_: executor",
  "",
].join("\n");

test("contextTermErrors: a term used nowhere outside CONTEXT.md is reported by name", () => {
  const errors = contextTermErrors(context, [
    { path: "skills/x/SKILL.md", source: "The vault is on every machine.\n" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Island host/);
  assert.doesNotMatch(errors[0], /Vault/);
});

test("contextTermErrors: the phrase is matched exactly but without regard to case", () => {
  assert.deepEqual(
    contextTermErrors(context, [
      { path: "docs/ARCHITECTURE.md", source: "the VAULT and the island host on Cursor" },
    ]),
    [],
  );
  assert.equal(
    contextTermErrors(context, [{ path: "docs/ARCHITECTURE.md", source: "the vault; an island is hosted" }]).length,
    1,
  );
});

test("contextTermErrors: a CONTEXT.md without a `## Language` section is an error", () => {
  const errors = contextTermErrors("# repo\n\n## Standards\n\n1. **Rule**: text\n", [
    { path: "docs/x.md", source: "rule" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /## Language/);
});

test("languageTerms: only the `**Term**:` lines of the `## Language` section count", () => {
  const source = [
    "## Standards",
    "",
    "**Not a term**:",
    "",
    "## Language",
    "",
    "**Vault**:",
    "text",
    "",
    "**Gate**:",
    "text _Avoid_: **confirmation**: no",
    "",
    "## Later",
    "",
    "**Also not a term**:",
  ].join("\n");
  assert.deepEqual(languageTerms(source), ["Vault", "Gate"]);
});

test("contextTermSources: every git-tracked file except CONTEXT.md and docs/research/", () => {
  const paths = contextTermSources(repoRoot).map((file) => file.path);
  assert.ok(paths.includes("docs/ARCHITECTURE.md"));
  assert.ok(paths.includes("skills/tdd/SKILL.md"));
  assert.ok(!paths.includes("CONTEXT.md"));
  assert.ok(paths.every((path) => !path.startsWith("docs/research/")));
});
