import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Handler = { type: string; command: string; if?: string; timeout?: number };
type Group = { matcher?: string; hooks: Handler[] };

const config = JSON.parse(readFileSync("hooks/hooks.json", "utf8")) as { hooks: Record<string, Group[]> };

const GATE = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/require-issue.ts" --runtime claude --event gate';
const REMINDER = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/require-issue.ts" --runtime claude --event reminder';

test("SessionStart runs the install check and the nerdbrain inject on startup, resume and clear", () => {
  assert.deepEqual(config.hooks.SessionStart, [
    {
      matcher: "startup|resume|clear",
      hooks: [
        { type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/check-install.sh" claude', timeout: 10 },
        { type: "command", command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.ts" --runtime claude', timeout: 5 },
      ],
    },
  ]);
});

test("UserPromptSubmit runs the issue reminder through node with a short timeout", () => {
  assert.deepEqual(config.hooks.UserPromptSubmit, [{ hooks: [{ type: "command", command: REMINDER, timeout: 5 }] }]);
});

test("PreToolUse gates only Bash git commit and git push, calling node directly", () => {
  assert.deepEqual(config.hooks.PreToolUse, [
    {
      matcher: "Bash",
      hooks: [
        { type: "command", if: "Bash(git commit *)", command: GATE, timeout: 5 },
        { type: "command", if: "Bash(git push *)", command: GATE, timeout: 5 },
      ],
    },
  ]);
});

test("no Claude Code hook sets onFailure, so a broken issue hook lets the action through", () => {
  const handlers = Object.values(config.hooks).flatMap((groups) => groups.flatMap((group) => group.hooks));
  assert.equal(handlers.some((handler) => "onFailure" in handler), false);
  assert.equal(handlers.filter((handler) => handler.command.includes("require-issue")).some((handler) => handler.command.includes(".sh")), false);
});
