import { test } from "node:test";
import assert from "node:assert/strict";

import { detectVersionDrift } from "./install-check.ts";

test("detectVersionDrift reports an installed version lower than main", () => {
  assert.deepEqual(detectVersionDrift("0.45.0", "0.51.0"), {
    kind: "version-drift",
    installed: "0.45.0",
    main: "0.51.0",
  });
});

test("detectVersionDrift stays silent when installed equals main", () => {
  assert.equal(detectVersionDrift("0.54.0", "0.54.0"), null);
});

test("detectVersionDrift stays silent when installed is ahead of main (working tree, branch)", () => {
  assert.equal(detectVersionDrift("0.55.0", "0.54.0"), null);
});

test("detectVersionDrift stays silent when main is unknown", () => {
  assert.equal(detectVersionDrift("0.54.0", null), null);
});
