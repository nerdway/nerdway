import { test } from "node:test";
import assert from "node:assert/strict";

import { interpolate, parseChecksums } from "./install.ts";

test("interpolates version into releaseBase", () => {
  const base = interpolate("https://example.test/v{version}", { version: "1.10.0" });
  assert.equal(base, "https://example.test/v1.10.0");
});

test("interpolates releaseBase into an asset url", () => {
  const vars = { version: "1.10.0", releaseBase: "https://example.test/v1.10.0" };
  assert.equal(interpolate("{releaseBase}/app.tar.gz", vars), "https://example.test/v1.10.0/app.tar.gz");
});

test("leaves unknown placeholders untouched", () => {
  assert.equal(interpolate("{nope}/x", { version: "1.0.0" }), "{nope}/x");
});

test("parses a goreleaser checksums file", () => {
  const text = [
    "abc123  linear-cli_Windows_x86_64.tar.gz",
    "def456  linear-cli_Linux_arm64.tar.gz",
    "",
  ].join("\n");
  const sums = parseChecksums(text);
  assert.equal(sums.get("linear-cli_Windows_x86_64.tar.gz"), "abc123");
  assert.equal(sums.size, 2);
});

test("tolerates the binary marker prefix on filenames", () => {
  const sums = parseChecksums("abc123 *linear-cli_Windows_x86_64.tar.gz");
  assert.equal(sums.get("linear-cli_Windows_x86_64.tar.gz"), "abc123");
});

test("normalizes uppercase hex hashes to lowercase", () => {
  const sums = parseChecksums("ABC123DEF456  linear-cli_Windows_x86_64.tar.gz");
  assert.equal(sums.get("linear-cli_Windows_x86_64.tar.gz"), "abc123def456");
});
