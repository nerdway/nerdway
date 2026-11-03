import assert from "node:assert/strict";
import { test } from "node:test";

import { detectHost } from "./host-detect.ts";
import { aimDispatchForHost, ORCHESTRATE_PARALLEL_CAP } from "./orchestrate-dispatch.ts";

test("claude-code and cursor use worktrees at cap 2 when git worktree is available", () => {
  for (const host of ["claude-code", "cursor"] as const) {
    assert.deepEqual(aimDispatchForHost(host, true), {
      maxParallel: ORCHESTRATE_PARALLEL_CAP,
      worktrees: true,
      cloudAgent: false,
    });
  }
  assert.equal(ORCHESTRATE_PARALLEL_CAP, 2);
});

test("claude-code and cursor fall back to sequential without worktrees", () => {
  for (const host of ["claude-code", "cursor"] as const) {
    assert.deepEqual(aimDispatchForHost(host, false), {
      maxParallel: 1,
      worktrees: false,
      cloudAgent: false,
    });
  }
});

test("grok-bot stays sequential or CloudAgent and never uses local worktrees as parallel", () => {
  assert.deepEqual(aimDispatchForHost("grok-bot", true), {
    maxParallel: 1,
    worktrees: false,
    cloudAgent: true,
  });
  assert.deepEqual(aimDispatchForHost("grok-bot", false), {
    maxParallel: 1,
    worktrees: false,
    cloudAgent: true,
  });
});

test("dispatch follows the same host detect as DEMO-478", () => {
  assert.equal(detectHost({ tools: ["AskUserQuestion"] }), "claude-code");
  assert.equal(detectHost({ tools: ["AskQuestion"] }), "cursor");
  assert.equal(detectHost({ tools: ["SendToUser"] }), "grok-bot");
  assert.equal(aimDispatchForHost(detectHost({ tools: ["AskUserQuestion"] }), true).worktrees, true);
  assert.equal(aimDispatchForHost(detectHost({ tools: ["SendToUser"] }), true).worktrees, false);
});
