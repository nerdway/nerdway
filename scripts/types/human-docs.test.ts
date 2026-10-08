import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { humanDocErrors, humanDocSources, validateHumanDocs } from "./human-docs.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("humanDocErrors: an em dash is reported with its path and line", () => {
  const errors = humanDocErrors([{ path: "README.md", source: "# Title\n\nInstall it — then run it.\n" }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^README\.md:3: /);
});

test("humanDocErrors: every line with an em dash is reported once", () => {
  const errors = humanDocErrors([
    { path: "docs/USER-GUIDE.md", source: "a — b — c\nplain - hyphen\nd — e\n" },
  ]);
  assert.deepEqual(
    errors.map((error) => error.slice(0, error.indexOf(" "))),
    ["docs/USER-GUIDE.md:1:", "docs/USER-GUIDE.md:3:"],
  );
});

test("humanDocErrors: hyphens, en dashes and arrows are allowed", () => {
  assert.deepEqual(humanDocErrors([{ path: "README.md", source: "a - b, 1–2, x → y\n" }]), []);
});

test("humanDocSources: README.md and the top level of docs/, not ADRs or archives", () => {
  const paths = humanDocSources(repoRoot).map((file) => file.path);
  assert.ok(paths.includes("README.md"));
  assert.ok(paths.includes("docs/USER-GUIDE.md"));
  assert.ok(paths.every((path) => path === "README.md" || /^docs\/[^/]+\.md$/.test(path)), paths.join(", "));
});

test("validateHumanDocs: the repository's human docs hold no em dash", () => {
  assert.deepEqual(validateHumanDocs(repoRoot), []);
});
