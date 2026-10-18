import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { denyVaultMcp } from "./deny-vault-mcp.ts";

const ALLOW = "{\"permission\": \"allow\"}\n";
const DENY =
  "{\"permission\": \"deny\", \"user_message\": \"Vault access is filesystem-only (ADR-0001). Obsidian MCP and the Local REST API are blocked.\", \"agent_message\": \"Do not use Obsidian MCP or http://127.0.0.1:27124. Read and write the vault via the filesystem only.\"}\n";

test("empty stdin allows the tool", () => {
  assert.equal(denyVaultMcp(""), ALLOW);
});

test("whitespace and invalid JSON allow the tool", () => {
  assert.equal(denyVaultMcp("   "), ALLOW);
  assert.equal(denyVaultMcp("not-json"), ALLOW);
});

test("an obsidian server or tool is denied", () => {
  assert.equal(denyVaultMcp(JSON.stringify({ mcp_server_name: "Obsidian" })), DENY);
  assert.equal(denyVaultMcp(JSON.stringify({ tool_name: "obsidian_read" })), DENY);
});

test("the local REST port is denied in the url or the command", () => {
  assert.equal(denyVaultMcp(JSON.stringify({ url: "http://127.0.0.1:27124/vault" })), DENY);
  assert.equal(denyVaultMcp(JSON.stringify({ command: "curl localhost:27124" })), DENY);
  assert.equal(denyVaultMcp(JSON.stringify({ url: "http://[::1]:27124/" })), DENY);
  assert.equal(denyVaultMcp(JSON.stringify({ mcp_server_url: "http://127.0.0.1:27124" })), DENY);
  assert.equal(denyVaultMcp(JSON.stringify({ url: "HTTP://127.0.0.1:27124" })), DENY);
});

test("a bare port number in the command is not the REST API", () => {
  assert.equal(denyVaultMcp(JSON.stringify({ command: "echo 27124" })), ALLOW);
});

test("tool_input is denied when it points at the REST API", () => {
  assert.equal(
    denyVaultMcp(JSON.stringify({ tool_input: { command: "curl http://127.0.0.1:27124" } })),
    DENY,
  );
  assert.equal(denyVaultMcp(JSON.stringify({ tool_input: "http://localhost:27124/notes" })), DENY);
});

test("an ordinary command is allowed", () => {
  assert.equal(denyVaultMcp(JSON.stringify({ command: "git status", tool_name: "Shell" })), ALLOW);
});

test("the script reads stdin and writes one JSON line", () => {
  const result = spawnSync(process.execPath, ["hooks/deny-vault-mcp.ts"], {
    input: JSON.stringify({ tool_name: "Shell", command: "git status" }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, ALLOW);
});
