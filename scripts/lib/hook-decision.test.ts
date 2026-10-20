import assert from "node:assert/strict";
import { test } from "node:test";

import { renderAllow, renderDeny } from "./hook-decision.ts";

const MESSAGES = { agent: "reason for the model", user: "note for the human" };

test("renderDeny gives Claude Code a PreToolUse deny with the reason for the model", () => {
  assert.deepEqual(JSON.parse(renderDeny("claude", MESSAGES)), {
    systemMessage: "note for the human",
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "reason for the model",
    },
  });
});

test("renderDeny gives Cursor permission deny with user_message and agent_message", () => {
  assert.deepEqual(JSON.parse(renderDeny("cursor", MESSAGES)), {
    permission: "deny",
    user_message: "note for the human",
    agent_message: "reason for the model",
  });
});

test("renderAllow is silence for Claude Code and an explicit allow for Cursor", () => {
  assert.equal(renderAllow("claude"), "");
  assert.deepEqual(JSON.parse(renderAllow("cursor")), { permission: "allow" });
});
