import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { externalReferenceErrors, externalReferenceSources, validateExternalReferences } from "./external-references.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("externalReferenceErrors: a superpowers skill call is reported with its path and line", () => {
  const errors = externalReferenceErrors([
    { path: "skills/x/SKILL.md", source: "# Skill\n\nInvoke superpowers:brainstorming first.\n" },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^skills\/x\/SKILL\.md:3: /);
  assert.match(errors[0], /superpowers:brainstorming/);
});

test("externalReferenceErrors: a mattpocock-skills call is reported too, every occurrence on its own line", () => {
  const errors = externalReferenceErrors([
    { path: "skills/x/SKILL.md", source: "use mattpocock-skills:grilling\nthen mattpocock-skills:domain-modeling\n" },
  ]);
  assert.deepEqual(
    errors.map((error) => error.slice(0, error.indexOf(" "))),
    ["skills/x/SKILL.md:1:", "skills/x/SKILL.md:2:"],
  );
});

test("externalReferenceErrors: naming superpowers or Matt Pocock in prose is not a call", () => {
  assert.deepEqual(
    externalReferenceErrors([
      { path: "docs/adr/0008.md", source: "superpowers writes a design spec; the pattern follows Matt Pocock's code-review (MIT)." },
      { path: "skills/y/SKILL.md", source: "the superpowers: plugin" },
    ]),
    [],
  );
});

test("externalReferenceErrors: research, the archive and the validator's own files are exempt", () => {
  const source = "cites superpowers:brainstorming\n";
  assert.deepEqual(
    externalReferenceErrors(
      [
        "docs/research/2026-10-06-sdd-patterns.md",
        "docs/plans/2026-08-05-bootstrap-clis.md",
        "docs/specs/2026-08-05-bootstrap-clis-design.md",
        "scripts/types/external-references.ts",
        "scripts/types/external-references.test.ts",
      ].map((path) => ({ path, source })),
    ),
    [],
  );
  assert.equal(externalReferenceErrors([{ path: "docs/adr/0009.md", source }]).length, 1);
});

test("externalReferenceSources: every git-tracked file, as a POSIX path relative to the repo root, with its content", () => {
  const sources = externalReferenceSources(repoRoot);
  const paths = sources.map((file) => file.path);
  assert.ok(paths.includes("skills/tdd/SKILL.md"), "skills/tdd/SKILL.md is tracked");
  assert.ok(paths.includes(".github/workflows/validate-plugin.yml"), "dotfiles are tracked too");
  assert.ok(paths.every((path) => !path.includes("\\") && !path.startsWith("/")));
  assert.match(sources.find((file) => file.path === "skills/tdd/SKILL.md")!.source, /^---\nname: tdd/);
});

test("validateExternalReferences: this repo is free of external skill calls", () => {
  assert.deepEqual(validateExternalReferences(repoRoot), []);
});
