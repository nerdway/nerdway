import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const hooks = JSON.parse(readFileSync("hooks/cursor.hooks.json", "utf8")) as {
  hooks: Record<string, Array<{ command: string; failClosed?: boolean; matcher?: string; timeout?: number }>>;
};

function commands(event: string): string[] {
  return hooks.hooks[event].map((entry) => entry.command);
}

test("sessionStart calls node for the inject, the install check and the issue reminder", () => {
  assert.deepEqual(commands("sessionStart"), [
    "node ./hooks/session-start.ts",
    "node ./scripts/check-install.ts --runtime cursor",
    "node ./hooks/require-issue.ts --runtime cursor --event reminder",
  ]);
});

test("the issue gate runs only on git commit and git push and fails open", () => {
  assert.deepEqual(hooks.hooks.beforeShellExecution, [
    { command: "node ./hooks/require-issue.ts --runtime cursor --event gate", matcher: "git (commit|push)", timeout: 5 },
  ]);
  const matcher = new RegExp(hooks.hooks.beforeShellExecution[0].matcher ?? "");
  for (const command of ["git commit -m x", "git push", "npm test && git push origin HEAD"]) {
    assert.equal(matcher.test(command), true, command);
  }
  for (const command of ["git status", "git log", "git pull", "ls"]) {
    assert.equal(matcher.test(command), false, command);
  }
  const reminder = hooks.hooks.sessionStart.find((entry) => entry.command.includes("require-issue"));
  assert.equal(reminder?.failClosed, undefined);
  assert.equal(hooks.hooks.beforeShellExecution[0].failClosed, undefined);
});

test("no hook runs on MCP execution or tool use", () => {
  assert.equal("beforeMCPExecution" in hooks.hooks, false);
  assert.equal("preToolUse" in hooks.hooks, false);
});

test("cursor hook commands do not start a shell script", () => {
  const all = Object.values(hooks.hooks).flat().map((entry) => entry.command);
  assert.equal(all.some((command) => command.includes(".sh")), false);
});

test("the Claude Code install wrapper stays and the session-start shell hook is gone", () => {
  assert.equal(existsSync("hooks/check-install.sh"), true);
  assert.equal(existsSync("hooks/session-start.sh"), false);
});
