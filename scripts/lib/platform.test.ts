import { test } from "node:test";
import assert from "node:assert/strict";

import { platformKey } from "./platform.ts";

test("builds a key from platform and arch", () => {
  assert.equal(platformKey("win32", "arm64"), "win32-arm64");
  assert.equal(platformKey("darwin", "arm64"), "darwin-arm64");
  assert.equal(platformKey("linux", "x64"), "linux-x64");
});

test("returns null for a combination the contract cannot express", () => {
  assert.equal(platformKey("freebsd", "x64"), null);
  assert.equal(platformKey("win32", "ia32"), null);
});
