import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "pending-vault.ts");

function run(args: string[], input = "") {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", input });
}

test("format-guide writes the queue comment and list reads it back from gh issue view JSON", () => {
  const out = mkdtempSync(join(tmpdir(), "pending-vault-cli-"));
  try {
    const text = "# Acme\n\nSource: https://github.com/acme/app/issues/7\n";
    const formatted = run(["format-guide", "--path", "guides/acme.md", "--mode", "create", "--entity", "none", "--out", out], text);
    assert.equal(formatted.status, 0, formatted.stderr);
    const files = formatted.stdout.trim().split("\n");
    assert.equal(files.length, 1);
    const body = readFileSync(files[0], "utf8");
    const listed = run(["list"], JSON.stringify({ comments: [{ body }] }));
    assert.equal(listed.status, 0, listed.stderr);
    assert.deepEqual(JSON.parse(listed.stdout), [{ kind: "guide", path: "guides/acme.md", mode: "create", entityPage: null, text }]);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("format-outcome and outcome agree; a verification line must come from the verify command", () => {
  const line = "verified guides/acme.md 10 bytes sha256:0123456789ab on desk 2026-11-23";
  const verified = run(["format-outcome", "verified", "--path", "guides/acme.md", "--verification", line]);
  assert.equal(verified.status, 0, verified.stderr);
  const outcome = run(["outcome"], JSON.stringify([verified.stdout]));
  assert.deepEqual(JSON.parse(outcome.stdout), { kind: "verified", path: "guides/acme.md", verification: line });
  assert.equal(run(["format-outcome", "verified", "--path", "guides/acme.md", "--verification", "written"]).status, 2);
  assert.equal(run(["format-guide", "--path", "g.md", "--mode", "create", "--entity", "none", "--out", tmpdir()], "  ").status, 2);
  assert.equal(run(["nope"]).status, 2);
});
