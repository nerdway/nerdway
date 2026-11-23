import assert from "node:assert/strict";
import { test } from "node:test";

import {
  commentBodies,
  formatGuideOutcome,
  formatPending,
  latestGuideOutcome,
  parseGuideOutcome,
  parsePending,
  type PendingCheckpoint,
  type PendingGuide,
} from "./pending-vault.ts";

const guide: PendingGuide = {
  kind: "guide",
  path: "guides/acme-app.md",
  mode: "create",
  entityPage: "github-com-acme-app",
  text: "# Acme app\n\n## Steps\n\n1. Run it.\n\nSource: https://github.com/acme/app/issues/7\n",
};

const checkpoint: PendingCheckpoint = {
  kind: "checkpoint",
  page: "entities/projects/github-com-acme-app.md",
  entry: "- 2026-11-23 #7: plan accepted; next: implement",
};

test("a pending guide round-trips through one comment", () => {
  const comments = formatPending(guide);
  assert.equal(comments.length, 1);
  assert.match(comments[0], /^## Pending guide\n\nPath: guides\/acme-app\.md\nMode: create\nEntity page link: github-com-acme-app\n\n# Acme app/);
  assert.deepEqual(parsePending(comments), [guide]);
});

test("a pending guide without an entity page writes `none` and parses back to null", () => {
  const comments = formatPending({ ...guide, entityPage: null, mode: "update" });
  assert.match(comments[0], /Entity page link: none\n/);
  assert.deepEqual(parsePending(comments), [{ ...guide, entityPage: null, mode: "update" }]);
});

test("a pending checkpoint round-trips", () => {
  const comments = formatPending(checkpoint);
  assert.equal(comments[0], `## Pending checkpoint\n\nPage: ${checkpoint.page}\n\n${checkpoint.entry}\n`);
  assert.deepEqual(parsePending(comments), [checkpoint]);
});

test("a guide over the comment limit is split into numbered parts and joined back in any order", () => {
  const text = `${"line of guide text\n".repeat(400)}Source: https://github.com/acme/app/issues/7\n`;
  const long: PendingGuide = { ...guide, text };
  const comments = formatPending(long, 2000);
  assert.ok(comments.length > 1);
  assert.ok(comments.every((comment) => comment.length <= 2000));
  assert.match(comments[0], /^## Pending guide \(part 1\/\d+\)\n/);
  assert.deepEqual(parsePending([...comments].reverse()), [long]);
});

test("an incomplete set of parts is not a pending guide", () => {
  const comments = formatPending({ ...guide, text: "x\n".repeat(3000) }, 2000);
  assert.deepEqual(parsePending(comments.slice(1)), []);
});

test("other comments and malformed queue comments are ignored", () => {
  assert.deepEqual(parsePending(["## Plan\n\nnothing", "## Pending guide\n\nMode: create\n\ntext"]), []);
});

test("guide outcomes format and parse: verified, pending, not needed", () => {
  const verified = { kind: "verified", path: "guides/acme-app.md", verification: "verified guides/acme-app.md 120 bytes sha256:0123456789ab on desk 2026-11-23" } as const;
  const pending = { kind: "pending", path: "guides/acme-app.md" } as const;
  const notNeeded = { kind: "not-needed", reason: "internal refactor, nothing for a person to do" } as const;
  assert.equal(formatGuideOutcome(verified), `## Personal guide\n\nGuide: ${verified.path}\nVerified: ${verified.verification}\n`);
  for (const outcome of [verified, pending, notNeeded]) assert.deepEqual(parseGuideOutcome(formatGuideOutcome(outcome)), outcome);
});

test("a guide line without Verified is not a verified outcome", () => {
  assert.deepEqual(parseGuideOutcome("## Personal guide\n\nGuide: guides/a.md\n"), { kind: "unverified", path: "guides/a.md" });
  assert.deepEqual(parseGuideOutcome("## Personal guide\n\nsomething else\n"), { kind: "none" });
  assert.deepEqual(parseGuideOutcome("## Plan\n\nGuide: guides/a.md\nVerified: x\n"), { kind: "none" });
});

test("the newest Personal guide comment decides, so a drained guide reads verified", () => {
  const comments = [
    formatGuideOutcome({ kind: "pending", path: "guides/a.md" }),
    "## Review\n\nok",
    formatGuideOutcome({ kind: "verified", path: "guides/a.md", verification: "verified guides/a.md 1 bytes sha256:000000000000 on desk 2026-11-23" }),
  ];
  assert.equal(latestGuideOutcome(comments).kind, "verified");
  assert.equal(latestGuideOutcome(["## Review\n\nok"]).kind, "none");
});

test("commentBodies reads strings, objects with body, and the gh issue view shape", () => {
  assert.deepEqual(commentBodies(["a"]), ["a"]);
  assert.deepEqual(commentBodies([{ body: "b" }, { other: 1 }]), ["b"]);
  assert.deepEqual(commentBodies({ comments: [{ body: "c" }] }), ["c"]);
  assert.deepEqual(commentBodies(null), []);
});
