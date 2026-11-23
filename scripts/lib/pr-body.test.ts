import { test } from "node:test";
import assert from "node:assert/strict";

import { READINESS_MARKER, classifyPrBody, magicWord, prBodyFromInput, withRefs } from "./pr-body.ts";

test("the start draft is the Fixes line and one paragraph", () => {
  assert.equal(classifyPrBody("Fixes DEMO-1\n\nAdds the thing for the people who need it."), "draft");
});

test("a start draft with one Fixes line per issue and a wrapped paragraph is still a draft", () => {
  assert.equal(classifyPrBody("Fixes DEMO-1\nFixes DEMO-2\n\nAdds the thing\nfor the people who need it.\n"), "draft");
});

test("the Azure DevOps start draft keeps the issue URL under the Fixes line", () => {
  assert.equal(classifyPrBody("Fixes DEMO-1\nhttps://linear.app/team/issue/DEMO-1\n\nAdds the thing."), "draft");
});

test("a draft with Windows line endings is still a draft", () => {
  assert.equal(classifyPrBody("Fixes #12\r\n\r\nAdds the thing.\r\n"), "draft");
});

test("an empty description counts as the start draft", () => {
  assert.equal(classifyPrBody(""), "draft");
  assert.equal(classifyPrBody("   \n"), "draft");
});

test("the Fixes line alone counts as the start draft", () => {
  assert.equal(classifyPrBody("Fixes DEMO-1"), "draft");
});

test("a description carrying the marker is a readiness description, whatever else it holds", () => {
  assert.equal(classifyPrBody(`Fixes DEMO-1\n\nWhy.\n\nWhat changed.\n\n${READINESS_MARKER}\n`), "readiness");
  assert.equal(classifyPrBody(`Fixes DEMO-1\n\nOne paragraph.\n${READINESS_MARKER}`), "readiness");
});

test("a collapsed readiness description with the marker is still readiness", () => {
  const body = [
    "Fixes DEMO-1",
    "",
    "## Summary",
    "",
    "Short intro.",
    "",
    "<details>",
    "<summary>Details</summary>",
    "",
    "## Why",
    "",
    "The problem.",
    "",
    "</details>",
    "",
    READINESS_MARKER,
  ].join("\n");
  assert.equal(classifyPrBody(body), "readiness");
});

test("a magic-line block followed by a Summary heading is not the start draft", () => {
  assert.equal(classifyPrBody("Fixes DEMO-1\n\n## Summary\nShort intro.\n"), "manual");
  assert.equal(classifyPrBody("Fixes DEMO-1\n\n## Summary\n\nShort intro.\n"), "manual");
});

test("a second paragraph without the marker is a description someone changed by hand", () => {
  assert.equal(classifyPrBody("Fixes DEMO-1\n\nAdds the thing.\n\nAlso note the migration."), "manual");
});

test("a paragraph without the Fixes line is a description someone changed by hand", () => {
  assert.equal(classifyPrBody("Adds the thing."), "manual");
});

test("a Fixes line in the middle of the text does not make it a draft", () => {
  assert.equal(classifyPrBody("Adds the thing.\n\nFixes DEMO-1"), "manual");
});

test("the marker is a hidden HTML comment", () => {
  assert.match(READINESS_MARKER, /^<!-- .+ -->$/);
});

test("the input is the raw description or the JSON a pr.view command prints", () => {
  assert.equal(prBodyFromInput("Fixes DEMO-1\n\nText."), "Fixes DEMO-1\n\nText.");
  assert.equal(prBodyFromInput(JSON.stringify({ title: "t", body: "Fixes DEMO-1" })), "Fixes DEMO-1");
  assert.equal(prBodyFromInput(JSON.stringify({ title: "t", description: "Fixes #3" })), "Fixes #3");
  assert.equal(prBodyFromInput(JSON.stringify({ title: "t", description: null })), "");
  assert.equal(prBodyFromInput(JSON.stringify("Fixes DEMO-1")), "Fixes DEMO-1");
});

test("a start draft whose magic line is Refs is still a draft", () => {
  assert.equal(classifyPrBody("Refs DEMO-1\n\nAdds the thing."), "draft");
  assert.equal(classifyPrBody("Refs DEMO-1\nhttps://linear.app/team/issue/DEMO-1\n\nAdds the thing."), "draft");
  assert.equal(classifyPrBody("Fixes DEMO-1\nRefs DEMO-2\n\nAdds the thing."), "draft");
});

test("withRefs switches every leading Fixes line to Refs and keeps the rest byte for byte", () => {
  const body = `Fixes #31\nFixes acme/app#2\n\n## Summary\n\nFixes the thing.\n\n${READINESS_MARKER}\n`;
  assert.equal(withRefs(body), `Refs #31\nRefs acme/app#2\n\n## Summary\n\nFixes the thing.\n\n${READINESS_MARKER}\n`);
  assert.equal(withRefs("Refs #31\n\nx"), "Refs #31\n\nx");
  assert.equal(withRefs("Fixes DEMO-1\r\nhttps://example.com/DEMO-1\r\n\r\nx"), "Refs DEMO-1\nhttps://example.com/DEMO-1\n\nx");
});

test("magicWord reads the first block: fixes, refs, mixed or none", () => {
  assert.equal(magicWord("Fixes #1\n\nx"), "fixes");
  assert.equal(magicWord("Refs #1\n\nx"), "refs");
  assert.equal(magicWord("Fixes #1\nRefs #2\n\nx"), "mixed");
  assert.equal(magicWord("## Summary\n\nFixes #1"), "none");
  assert.equal(magicWord(""), "none");
});
