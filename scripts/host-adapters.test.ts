import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { sectionBody, tableRows } from "./types/workflow-graph.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const HOSTS = ["grok-bot", "claude-code", "cursor"] as const;
const OPERATIONS = ["host.detect", "post-plan.after-plan"];

function operationRows(host: string): string[][] {
  const path = `adapters/hosts/${host}.md`;
  assert.ok(existsSync(join(repoRoot, path)), `${path} exists`);
  const table = sectionBody(read(path), "Operations");
  assert.ok(table !== undefined, `${path} needs a ## Operations section`);
  return tableRows(table);
}

for (const host of HOSTS) {
  test(`adapters/hosts/${host}.md lists the host operations`, () => {
    assert.deepEqual(
      operationRows(host).map((row) => row[0]),
      OPERATIONS,
    );
  });

  test(`adapters/hosts/${host}.md has a Detection section`, () => {
    assert.ok(sectionBody(read(`adapters/hosts/${host}.md`), "Detection"));
  });
}

test("grok-bot after-plan is the native widget with Implementuj teraz / Później", () => {
  const source = read("adapters/hosts/grok-bot.md");
  assert.match(source, /SendToUser/);
  assert.match(source, /Implementuj teraz/);
  assert.match(source, /Później/);
  assert.match(source, /issue\.set-status/);
  assert.match(source, /in-progress/);
  assert.match(source, /Leave the phase `todo`|leave the phase `todo`|Leave the phase \*\*`todo`\*\*|stop/);
});

test("claude-code and cursor after-plan keep the 0.73.0 prose path", () => {
  for (const host of ["claude-code", "cursor"] as const) {
    const source = read(`adapters/hosts/${host}.md`).replace(/\s+/g, " ");
    assert.match(source, /Asking the human to move a phase/);
    assert.match(source, /adapters\/statuses\.md/);
    assert.match(source, /do \*\*not\*\* write `in-progress`/);
    assert.doesNotMatch(source, /Implementuj teraz/);
    assert.doesNotMatch(source, /SendToUser/);
  }
});
