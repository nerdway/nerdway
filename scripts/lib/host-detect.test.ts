import assert from "node:assert/strict";
import { test } from "node:test";

import { detectHost } from "./host-detect.ts";

test("explicit NERD4RENT_HOST wins over tools", () => {
  assert.equal(detectHost({ env: { NERD4RENT_HOST: "cursor" }, tools: ["SendToUser"] }), "cursor");
});

test("explicit AGENT_HOST wins when NERD4RENT_HOST is absent", () => {
  assert.equal(detectHost({ env: { AGENT_HOST: "grok-bot" }, tools: ["AskUserQuestion"] }), "grok-bot");
});

test("unknown explicit host is ignored", () => {
  assert.equal(detectHost({ env: { NERD4RENT_HOST: "codex" }, tools: ["AskUserQuestion"] }), "claude-code");
});

test("SendToUser selects grok-bot", () => {
  assert.equal(detectHost({ tools: ["SendToUser"] }), "grok-bot");
  assert.equal(detectHost({ tools: ["send_to_user"] }), "grok-bot");
});

test("GROK_BOT env selects grok-bot", () => {
  assert.equal(detectHost({ env: { GROK_BOT: "1" }, tools: ["AskQuestion"] }), "grok-bot");
});

test("AskUserQuestion selects claude-code", () => {
  assert.equal(detectHost({ tools: ["AskUserQuestion"] }), "claude-code");
});

test("CLAUDE_CODE env selects claude-code", () => {
  assert.equal(detectHost({ env: { CLAUDE_CODE: "1" }, tools: ["AskQuestion"] }), "claude-code");
});

test("AskQuestion selects cursor", () => {
  assert.equal(detectHost({ tools: ["AskQuestion"] }), "cursor");
  assert.equal(detectHost({ tools: ["ask-question"] }), "cursor");
});

test("CURSOR_TRACE_ID selects cursor", () => {
  assert.equal(detectHost({ env: { CURSOR_TRACE_ID: "abc" } }), "cursor");
});

test("empty session falls back to claude-code prose path", () => {
  assert.equal(detectHost({}), "claude-code");
  assert.equal(detectHost({ env: {}, tools: [] }), "claude-code");
});

test("grok-bot wins over claude-code when both tools are present", () => {
  assert.equal(detectHost({ tools: ["AskUserQuestion", "SendToUser"] }), "grok-bot");
});
