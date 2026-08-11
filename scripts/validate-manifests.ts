import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, ".claude-plugin", path), "utf8")) as Record<string, unknown>;
}

const plugin = read("plugin.json").version;
const marketplace = (read("marketplace.json").metadata as { version?: unknown } | undefined)?.version;

function missing(value: unknown): boolean {
  return typeof value !== "string" || value.length === 0;
}

if (missing(plugin) || missing(marketplace)) {
  console.error("manifest versions are missing:");
  console.error(`  - plugin.json version: ${plugin}`);
  console.error(`  - marketplace.json metadata.version: ${marketplace}`);
  process.exit(1);
}

if (plugin !== marketplace) {
  console.error("manifest versions disagree:");
  console.error(`  - plugin.json version: ${plugin}`);
  console.error(`  - marketplace.json metadata.version: ${marketplace}`);
  console.error("Both must move together on every release; see the Releasing section in README.md.");
  process.exit(1);
}

console.log(`OK: both manifests are at ${plugin}`);
