import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateManifests } from "./types/manifests.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8")) as Record<string, unknown>;
}

const errors = validateManifests({
  claudePlugin: readJson(".claude-plugin/plugin.json"),
  marketplace: readJson(".claude-plugin/marketplace.json"),
  cursorPlugin: readJson(".cursor-plugin/plugin.json"),
});

const cursorMarketplace = readJson(".cursor-plugin/marketplace.json");
const cursorPluginName = readJson(".cursor-plugin/plugin.json").name;
const MARKETPLACE_KEYS = new Set(["name", "owner", "metadata", "plugins"]);
const ENTRY_KEYS = new Set(["name", "source", "description", "minClientVersions"]);
for (const key of Object.keys(cursorMarketplace)) {
  if (!MARKETPLACE_KEYS.has(key)) errors.push(`.cursor-plugin/marketplace.json: unexpected key "${key}"`);
}
const entries = Array.isArray(cursorMarketplace.plugins) ? cursorMarketplace.plugins : [];
if (entries.length !== 1) errors.push(".cursor-plugin/marketplace.json: expected exactly one plugin entry");
for (const entry of entries as Record<string, unknown>[]) {
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key)) errors.push(`.cursor-plugin/marketplace.json plugins[]: unexpected key "${key}"`);
  }
  if (entry.name !== cursorPluginName) {
    errors.push(`.cursor-plugin/marketplace.json plugins[].name "${String(entry.name)}" != .cursor-plugin/plugin.json name "${String(cursorPluginName)}"`);
  }
  if (typeof entry.source !== "string" || entry.source.length === 0) {
    errors.push(".cursor-plugin/marketplace.json plugins[].source must be a non-empty string");
  }
}

if (errors.length > 0) {
  console.error("manifest validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const version = readJson(".claude-plugin/plugin.json").version;
console.log(`OK: all three manifests are at ${version}`);
