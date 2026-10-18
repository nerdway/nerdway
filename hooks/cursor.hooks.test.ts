import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const hooks = JSON.parse(readFileSync("hooks/cursor.hooks.json", "utf8")) as {
  hooks: Record<string, Array<{ command: string; failClosed?: boolean }>>;
};

function commands(event: string): string[] {
  return hooks.hooks[event].map((entry) => entry.command);
}

test("sessionStart calls node for the inject and the install check", () => {
  assert.deepEqual(commands("sessionStart"), [
    "node ./hooks/session-start.ts",
    "node ./scripts/check-install.ts --runtime cursor",
  ]);
});

test("deny stays fail-closed and calls node", () => {
  for (const event of ["beforeMCPExecution", "preToolUse"]) {
    assert.deepEqual(hooks.hooks[event], [
      { command: "node ./hooks/deny-vault-mcp.ts", failClosed: true },
    ]);
  }
});

test("cursor hook commands do not start a shell script", () => {
  const all = Object.values(hooks.hooks).flat().map((entry) => entry.command);
  assert.equal(all.some((command) => command.includes(".sh")), false);
});

test("the Claude Code install wrapper stays and the two shell hooks are gone", () => {
  assert.equal(existsSync("hooks/check-install.sh"), true);
  assert.equal(existsSync("hooks/deny-vault-mcp.sh"), false);
  assert.equal(existsSync("hooks/session-start.sh"), false);
});
