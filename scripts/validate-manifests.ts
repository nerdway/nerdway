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

if (plugin !== marketplace) {
  console.error("manifest versions disagree:");
  console.error(`  - plugin.json version: ${plugin}`);
  console.error(`  - marketplace.json metadata.version: ${marketplace}`);
  console.error("Both must move together on every release; see the Releasing section in README.md.");
  process.exit(1);
}

console.log(`OK: both manifests are at ${plugin}`);
