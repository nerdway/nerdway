import { test } from "node:test";
import assert from "node:assert/strict";

import { decideAfterInstall, formatReport, type Outcome } from "./status.ts";

test("reports installed when a previously missing CLI now probes ok", () => {
  const status = decideAfterInstall("missing", { status: "ok", version: "1.10.0" }, true);
  assert.equal(status, "INSTALLED");
});

test("reports updated when a previously outdated CLI now probes ok", () => {
  const status = decideAfterInstall("outdated", { status: "ok", version: "1.10.0" }, true);
  assert.equal(status, "UPDATED");
});

test("reports needs-path when the binary was placed but still does not probe", () => {
  const status = decideAfterInstall("missing", { status: "missing" }, true);
  assert.equal(status, "NEEDS_PATH");
});

test("reports failed when nothing was placed and it still does not probe", () => {
  const status = decideAfterInstall("missing", { status: "missing" }, false);
  assert.equal(status, "FAILED");
});

test("reports failed when the reinstall still does not satisfy the minimum", () => {
  const status = decideAfterInstall("outdated", { status: "outdated", version: "1.9.0" }, true);
  assert.equal(status, "FAILED");
});

test("reports unknown when the post-install probe does not match versionRegex", () => {
  const status = decideAfterInstall("missing", { status: "unknown", output: "garbled" }, true);
  assert.equal(status, "UNKNOWN");
});

test("formatReport lists one line per entry and flags the not-ok ones", () => {
  const outcomes: Outcome[] = [
    { id: "linear", status: "INSTALLED", detail: "checksum verified" },
    { id: "gh", status: "NEEDS_AUTH", detail: "Run `gh auth login`" },
  ];
  const text = formatReport(outcomes);
  assert.match(text, /linear/);
  assert.match(text, /INSTALLED/);
  assert.match(text, /gh/);
  assert.match(text, /NEEDS_AUTH/);
});

test("formatReport marks an all-ok run", () => {
  const text = formatReport([{ id: "git", status: "OK", detail: "2.55.0" }]);
  assert.match(text, /OK/);
});
