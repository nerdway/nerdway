import { test } from "node:test";
import assert from "node:assert/strict";

import { READINESS_MARKER, classifyPrBody, prBodyFromInput } from "./pr-body.ts";

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
