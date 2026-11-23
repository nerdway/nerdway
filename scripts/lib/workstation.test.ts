import assert from "node:assert/strict";
import { test } from "node:test";

import { detectMachine } from "./workstation.ts";

test("a local Claude Code or Cursor session with no remote signal is a workstation", () => {
  assert.deepEqual(detectMachine({ env: {}, host: "claude-code" }), { kind: "workstation", reason: "local-host" });
  assert.deepEqual(detectMachine({ env: {}, host: "cursor" }), { kind: "workstation", reason: "local-host" });
});

test("the host defaults to the env-only host probe", () => {
  assert.equal(detectMachine({ env: {} }).kind, "workstation");
  assert.equal(detectMachine({ env: { NERDWAY_HOST: "slack-thread" } }).kind, "remote");
});

test("NERDWAY_MACHINE overrides every other signal", () => {
  assert.deepEqual(detectMachine({ env: { NERDWAY_MACHINE: "remote" }, host: "claude-code" }), { kind: "remote", reason: "override" });
  assert.deepEqual(detectMachine({ env: { NERDWAY_MACHINE: " workstation ", CLAUDE_CODE_REMOTE: "true" }, host: "slack-thread" }), {
    kind: "workstation",
    reason: "override",
  });
});

test("an unknown NERDWAY_MACHINE value is ignored", () => {
  assert.equal(detectMachine({ env: { NERDWAY_MACHINE: "laptop" }, host: "claude-code" }).kind, "workstation");
});

test("a Claude Code cloud session is remote", () => {
  assert.deepEqual(detectMachine({ env: { CLAUDE_CODE_REMOTE: "true" }, host: "claude-code" }), { kind: "remote", reason: "remote-signal" });
  assert.equal(detectMachine({ env: { CLAUDE_CODE_REMOTE: "false" }, host: "claude-code" }).kind, "workstation");
});

test("a Cursor cloud worker, a codespace and a cloud agent box are remote", () => {
  for (const env of [
    { CURSOR_AGENT_WORKER_ID: "w1" },
    { CURSOR_WORKER_POOL_NAME: "pool" },
    { CODESPACES: "true" },
    { CLOUD_AGENT_INJECTED_SECRET_NAMES: "A,B" },
  ]) {
    assert.deepEqual(detectMachine({ env, host: "cursor" }), { kind: "remote", reason: "remote-signal" }, JSON.stringify(env));
  }
});

test("chat hosts are remote", () => {
  assert.deepEqual(detectMachine({ env: {}, host: "slack-thread" }), { kind: "remote", reason: "chat-host" });
  assert.deepEqual(detectMachine({ env: {}, host: "grok-bot" }), { kind: "remote", reason: "chat-host" });
});
