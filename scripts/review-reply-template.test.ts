import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const templatePath = join(import.meta.dirname, "../skills/issue-workflow/review-reply-template.md");

const authorTools = ["nerd4rent", "claude", "cursor", "linear", "linearis"];

test("the review reply template can be posted on a client repository", () => {
  const text = readFileSync(templatePath, "utf8");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  assert.equal(firstLine.startsWith("Status:"), false);
  assert.doesNotMatch(text, /\b[A-Z][A-Z0-9]+-\d+\b/);
  assert.doesNotMatch(text, /(^|\s)#\d+\b/);
  for (const tool of authorTools) {
    assert.equal(text.toLowerCase().includes(tool), false, tool);
  }
});
