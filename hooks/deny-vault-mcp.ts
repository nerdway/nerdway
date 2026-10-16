import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USER_MESSAGE =
  "Vault access is filesystem-only (ADR-0001). Obsidian MCP and the Local REST API are blocked.";
const AGENT_MESSAGE =
  "Do not use Obsidian MCP or http://127.0.0.1:27124. Read and write the vault via the filesystem only.";

function jsonLine(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(", ");
  return `{${body}}\n`;
}

function field(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value.toLowerCase();
  }
  return "";
}

function readInput(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
  return {};
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "" && value !== false;
}

export function denyVaultMcp(raw: string): string {
  const data = readInput(raw);
  let command = field(data, ["command"]);
  const tool = field(data, ["tool_name"]);
  const server = field(data, ["mcp_server_name"]);
  const url = field(data, ["url", "mcp_server_url"]);
  const input = data.tool_input;
  if (!present(command) && typeof input === "object" && input !== null && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const nested = present(record.command) ? record.command : present(record.url) ? record.url : "";
    command = String(nested).toLowerCase();
  } else if (!present(command) && typeof input === "string") {
    command = input.toLowerCase();
  }
  const haystack = [url, command].filter((part) => part.length > 0).join(" ");
  const blocked =
    server.includes("obsidian") ||
    tool.includes("obsidian") ||
    haystack.includes("127.0.0.1:27124") ||
    haystack.includes("localhost:27124") ||
    haystack.includes("[::1]:27124") ||
    url.includes("27124");
  if (blocked) {
    return jsonLine({
      permission: "deny",
      user_message: USER_MESSAGE,
      agent_message: AGENT_MESSAGE,
    });
  }
  return jsonLine({ permission: "allow" });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  process.stdout.write(denyVaultMcp(readFileSync(0, "utf8")));
}
