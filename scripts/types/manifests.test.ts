import { test } from "node:test";
import assert from "node:assert/strict";

import { validateClaudeCodeIsolation, validateManifests } from "./manifests.ts";

function claudePlugin(overrides: Record<string, unknown> = {}) {
  return { name: "nerd4rent", version: "0.29.0", ...overrides };
}

function marketplace(overrides: Record<string, unknown> = {}) {
  return { metadata: { version: "0.29.0" }, ...overrides };
}

function cursorPlugin(overrides: Record<string, unknown> = {}) {
  return {
    name: "nerd4rent",
    version: "0.29.0",
    skills: "./skills/",
    agents: "./agents/",
    hooks: "./hooks/cursor.hooks.json",
    ...overrides,
  };
}

function set(overrides: {
  claudePlugin?: Record<string, unknown>;
  marketplace?: Record<string, unknown>;
  cursorPlugin?: Record<string, unknown>;
} = {}) {
  return {
    claudePlugin: overrides.claudePlugin ?? claudePlugin(),
    marketplace: overrides.marketplace ?? marketplace(),
    cursorPlugin: overrides.cursorPlugin ?? cursorPlugin(),
  };
}

const REPO = new Set(["skills/", "agents/", "hooks/cursor.hooks.json"]);
const inRepo = (extra: string[] = []) => {
  const files = new Set([...REPO, ...extra]);
  return (path: string) => files.has(path);
};

test("accepts three matching versions and the closed Cursor schema", () => {
  assert.deepEqual(validateManifests(set()), []);
});

test("rejects when any of the three versions is missing", () => {
  const errors = validateManifests(set({ claudePlugin: claudePlugin({ version: "" }) }));
  assert.ok(errors.some((error) => /missing/i.test(error)));
});

test("rejects when the three versions disagree", () => {
  const errors = validateManifests(set({ cursorPlugin: cursorPlugin({ version: "0.30.0" }) }));
  assert.ok(errors.some((error) => /disagree/i.test(error)));
  assert.ok(errors.some((error) => error.includes("0.29.0")));
  assert.ok(errors.some((error) => error.includes("0.30.0")));
});

test("rejects a Cursor Plugin field outside its schema", () => {
  const errors = validateManifests(set({ cursorPlugin: cursorPlugin({ extra: true }) }));
  assert.ok(errors.some((error) => /extra/.test(error) && /cursor plugin/i.test(error)));
});

test("rejects a Cursor Plugin missing name", () => {
  const raw = cursorPlugin();
  delete raw.name;
  const errors = validateManifests(set({ cursorPlugin: raw }));
  assert.ok(errors.some((error) => /name/.test(error) && /cursor plugin/i.test(error)));
});

test("accepts Cursor files kept out of Claude Code's convention paths", () => {
  assert.deepEqual(validateClaudeCodeIsolation(cursorPlugin(), inRepo()), []);
});

test("rejects hooks/hooks.json, which Claude Code auto-discovers", () => {
  const errors = validateClaudeCodeIsolation(cursorPlugin(), inRepo(["hooks/hooks.json"]));
  assert.ok(errors.some((error) => error.startsWith("hooks/hooks.json:")));
});

test("rejects a root plugin.json, Claude Code's fallback manifest", () => {
  const errors = validateClaudeCodeIsolation(cursorPlugin(), inRepo(["plugin.json"]));
  assert.ok(errors.some((error) => error.startsWith("plugin.json:")));
});

test("rejects a Cursor manifest pointing hooks at hooks/hooks.json", () => {
  const errors = validateClaudeCodeIsolation(
    cursorPlugin({ hooks: "./hooks/hooks.json" }),
    inRepo(["hooks/hooks.json"]),
  );
  assert.ok(errors.some((error) => /auto-discovers/.test(error)));
});

test("rejects a Cursor manifest without an explicit hooks path", () => {
  const raw = cursorPlugin();
  delete raw.hooks;
  const errors = validateClaudeCodeIsolation(raw, inRepo());
  assert.ok(errors.some((error) => /hooks must name/.test(error)));
});

test("rejects a Cursor manifest path that does not exist", () => {
  const errors = validateClaudeCodeIsolation(cursorPlugin({ agents: "./missing/" }), inRepo());
  assert.ok(errors.some((error) => /agents path "\.\/missing\/" does not exist/.test(error)));
});
