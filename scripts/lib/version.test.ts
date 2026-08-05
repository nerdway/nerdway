import { test } from "node:test";
import assert from "node:assert/strict";

import { compareVersions, extractVersion, satisfiesMinimum } from "./version.ts";

test("compares numerically, not lexically", () => {
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1);
  assert.equal(compareVersions("1.9.0", "1.10.0"), -1);
});

test("treats equal versions as equal", () => {
  assert.equal(compareVersions("2.3.1", "2.3.1"), 0);
});

test("orders by major before minor before patch", () => {
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("1.2.10", "1.2.9"), 1);
});

test("satisfiesMinimum accepts equal and newer", () => {
  assert.equal(satisfiesMinimum("1.10.0", "1.10.0"), true);
  assert.equal(satisfiesMinimum("1.11.0", "1.10.0"), true);
  assert.equal(satisfiesMinimum("1.9.0", "1.10.0"), false);
});

test("extracts the first capture group", () => {
  assert.equal(extractVersion("linear version 1.10.0", "linear version (\\d+\\.\\d+\\.\\d+)"), "1.10.0");
  assert.equal(extractVersion("v24.19.0", "v(\\d+\\.\\d+\\.\\d+)"), "24.19.0");
});

test("extracts from multi-line output", () => {
  const output = "gh version 2.97.0 (2026-07-31)\nhttps://github.com/cli/cli";
  assert.equal(extractVersion(output, "gh version (\\d+\\.\\d+\\.\\d+)"), "2.97.0");
});

test("returns null when the pattern does not match", () => {
  assert.equal(extractVersion("something else entirely", "linear version (\\d+\\.\\d+\\.\\d+)"), null);
});
