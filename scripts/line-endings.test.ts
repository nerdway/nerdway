import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test(".gitattributes forces LF on every text file", () => {
  const rules = readFileSync(join(repoRoot, ".gitattributes"), "utf8")
    .split("\n")
    .map((line) => line.trim().split(/\s+/));
  const forcesLf = rules.some(
    ([pattern, ...attributes]) =>
      pattern === "*" && attributes.includes("text=auto") && attributes.includes("eol=lf"),
  );
  assert.ok(forcesLf, ".gitattributes needs the rule `* text=auto eol=lf`");
});

test("no tracked text file has CRLF or mixed line endings in the index", () => {
  const offenders = execFileSync("git", ["ls-files", "--eol"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((line) => /^i\/(crlf|mixed)\s/.test(line))
    .map((line) => line.slice(line.indexOf("\t") + 1));
  assert.deepEqual(offenders, [], "renormalize with `git add --renormalize .` and commit");
});
