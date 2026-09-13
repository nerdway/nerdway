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
  agentPlugin: readJson("plugin.json"),
  cursorPlugin: readJson(".cursor-plugin/plugin.json"),
});

if (errors.length > 0) {
  console.error("manifest validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const version = readJson(".claude-plugin/plugin.json").version;
console.log(`OK: all four manifests are at ${version}`);
