import assert from "node:assert/strict";
import { test } from "node:test";

import { decideLevel, dropLevel, type BoardRights, type Level } from "./board-rights.ts";

const rights = (native: BoardRights["native"], label: BoardRights["label"], reason = "probe"): BoardRights => ({
  native,
  label,
  reason,
});

test("decideLevel: native yes wins over every label value", () => {
  for (const label of ["yes", "no", "unknown"] as const) {
    const decided = decideLevel(rights("yes", label));
    assert.equal(decided.level, "native");
    assert.equal(decided.uncertain, false);
    assert.match(decided.reason, /probe|native/);
  }
});

test("decideLevel: native unknown proposes native and marks it uncertain, so the skill asks", () => {
  for (const label of ["yes", "no", "unknown"] as const) {
    const decided = decideLevel(rights("unknown", label, "acli has no permission command"));
    assert.equal(decided.level, "native");
    assert.equal(decided.uncertain, true);
    assert.match(decided.reason, /acli/);
  }
});

test("decideLevel: native no and label yes selects label", () => {
  const decided = decideLevel(rights("no", "yes", "viewerCanUpdate false; permissions.push true"));
  assert.equal(decided.level, "label");
  assert.equal(decided.uncertain, false);
  assert.match(decided.reason, /push/);
});

test("decideLevel: native no and label unknown proposes label and asks", () => {
  const decided = decideLevel(rights("no", "unknown", "label rights unclear"));
  assert.equal(decided.level, "label");
  assert.equal(decided.uncertain, true);
});

test("decideLevel: both no selects comment", () => {
  const decided = decideLevel(rights("no", "no", "no board or label rights"));
  assert.equal(decided.level, "comment");
  assert.equal(decided.uncertain, false);
  assert.match(decided.reason, /no board/);
});

test("dropLevel: a 403 drops exactly one level", () => {
  assert.equal(dropLevel("native"), "label");
  assert.equal(dropLevel("label"), "comment");
  assert.equal(dropLevel("comment"), "comment");
});

test("decideLevel after a native 403: drop to label and ask again", () => {
  const after = decideLevel(rights("no", "yes", "403 on native write"), "label");
  assert.equal(after.level, "label");
  assert.equal(after.uncertain, false);
});

test("decideLevel after a native 403 with unknown label rights: propose label and ask", () => {
  const after = decideLevel(rights("no", "unknown", "403 on native write"));
  assert.equal(after.level, "label");
  assert.equal(after.uncertain, true);
});

test("decideLevel after a label 403: drop to comment", () => {
  const after = decideLevel(rights("no", "no", "403 on label write"), "comment");
  assert.equal(after.level, "comment");
  assert.equal(after.uncertain, false);
});

test("decideLevel: an explicit floor is the 403 drop — never climb back", () => {
  const floors: Level[] = ["native", "label", "comment"];
  for (const floor of floors) {
    const decided = decideLevel(rights("yes", "yes"), floor);
    assert.equal(decided.level, floor);
  }
});
