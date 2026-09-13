import { test } from "node:test";
import assert from "node:assert/strict";

import { validateManifests } from "./manifests.ts";

const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

function claudePlugin(overrides: Record<string, unknown> = {}) {
  return { name: "nerd4rent", version: "0.29.0", ...overrides };
}

function marketplace(overrides: Record<string, unknown> = {}) {
  return { metadata: { version: "0.29.0" }, ...overrides };
}

function agentPlugin(overrides: Record<string, unknown> = {}) {
  return {
    $schema: SCHEMA,
    name: "nerd4rent",
    version: "0.29.0",
    ...overrides,
  };
}

function cursorPlugin(overrides: Record<string, unknown> = {}) {
  return {
    name: "nerd4rent",
    version: "0.29.0",
    skills: "./skills/",
    agents: "./agents/",
    hooks: "./hooks/hooks.json",
    ...overrides,
  };
}

function set(overrides: {
  claudePlugin?: Record<string, unknown>;
  marketplace?: Record<string, unknown>;
  agentPlugin?: Record<string, unknown>;
  cursorPlugin?: Record<string, unknown>;
} = {}) {
  return {
    claudePlugin: overrides.claudePlugin ?? claudePlugin(),
    marketplace: overrides.marketplace ?? marketplace(),
    agentPlugin: overrides.agentPlugin ?? agentPlugin(),
    cursorPlugin: overrides.cursorPlugin ?? cursorPlugin(),
  };
}

test("accepts four matching versions and closed schemas", () => {
  assert.deepEqual(validateManifests(set()), []);
});

test("rejects when any of the four versions is missing", () => {
  const errors = validateManifests(set({ claudePlugin: claudePlugin({ version: "" }) }));
  assert.ok(errors.some((error) => /missing/i.test(error)));
});

test("rejects when the four versions disagree", () => {
  const errors = validateManifests(set({ cursorPlugin: cursorPlugin({ version: "0.30.0" }) }));
  assert.ok(errors.some((error) => /disagree/i.test(error)));
  assert.ok(errors.some((error) => error.includes("0.29.0")));
  assert.ok(errors.some((error) => error.includes("0.30.0")));
});

test("rejects a root Agent Plugin field outside schema 1.0.0", () => {
  const errors = validateManifests(set({ agentPlugin: agentPlugin({ skills: "./skills/" }) }));
  assert.ok(errors.some((error) => /skills/.test(error) && /agent plugin/i.test(error)));
});

test("rejects a root Agent Plugin missing $schema 1.0.0", () => {
  const raw = agentPlugin();
  delete raw.$schema;
  const errors = validateManifests(set({ agentPlugin: raw }));
  assert.ok(errors.some((error) => /\$schema/.test(error)));
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
