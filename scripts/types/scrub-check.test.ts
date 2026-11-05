import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXEMPT_PATHS,
  SCRUB_PATTERN_SOURCE,
  scrubCheckErrors,
  scrubCheckSources,
  validateScrubCheck,
} from "./scrub-check.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const privateOrg = ["nerd", "4rent"].join("");

test("scrubCheckErrors: a private-track string is reported with its path and line", () => {
  const errors = scrubCheckErrors([{ path: "README.md", source: "# Title\n\nSee NER-123 for context.\n" }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^README\.md:3: /);
});

test("scrubCheckErrors: every matching line is reported once", () => {
  const errors = scrubCheckErrors([
    { path: "docs/USER-GUIDE.md", source: "NER-1\nplain\nGRO-2\n" },
  ]);
  assert.deepEqual(
    errors.map((error) => error.slice(0, error.indexOf(" "))),
    ["docs/USER-GUIDE.md:1:", "docs/USER-GUIDE.md:3:"],
  );
});

test("scrubCheckErrors: Proxmox, Coder, pve and the private Linear URL match", () => {
  const errors = scrubCheckErrors([
    {
      path: "docs/ARCHITECTURE.md",
      source: `Proxmox\nCoder\npve1\nhttps://linear.app/${privateOrg}/issue/x\n`,
    },
  ]);
  assert.equal(errors.length, 4);
});

test("scrubCheckErrors: a bare private-org brand string fails", () => {
  const errors = scrubCheckErrors([{ path: "README.md", source: `see ${privateOrg} for the private track\n` }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^README\.md:1: /);
});

test("scrubCheckErrors: mixed-case brand and env-style leak fail", () => {
  const mixed = `${privateOrg.toUpperCase()}_X`;
  const errors = scrubCheckErrors([{ path: "README.md", source: `${mixed}\n` }]);
  assert.equal(errors.length, 1);
});

test("scrubCheckErrors: a nerdway string passes", () => {
  assert.deepEqual(
    scrubCheckErrors([{ path: "README.md", source: "# nerdway\n\nInvoke /nerdway:issue-writer.\n" }]),
    [],
  );
});

test("scrubCheckErrors: exempt paths may name the patterns", () => {
  const source = `patterns: ${SCRUB_PATTERN_SOURCE}\n`;
  assert.deepEqual(
    scrubCheckErrors(EXEMPT_PATHS.map((path) => ({ path, source }))),
    [],
  );
});

test("scrubCheckErrors: a clean file is silent", () => {
  assert.deepEqual(scrubCheckErrors([{ path: "README.md", source: "# nerdway\n\nMIT plus paid support.\n" }]), []);
});

test("scrubCheckSources: every exempt path is tracked", () => {
  const paths = new Set(scrubCheckSources(repoRoot).map((file) => file.path));
  for (const path of EXEMPT_PATHS) {
    assert.ok(paths.has(path), path);
  }
});

test("validateScrubCheck: the public tree is clean outside exempt files", () => {
  assert.deepEqual(validateScrubCheck(repoRoot), []);
});
