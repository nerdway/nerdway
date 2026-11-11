import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { writePlatformConfig } from "./lib/nerdway-config.ts";
import { pluginVocabulary, trackerAdapterSources } from "./lib/platform-read.ts";
import { parseYaml } from "./types/platform-config.ts";

const EXIT_INVALID = 4;
const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, "..");

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const args = process.argv.slice(2);
const defaults = args.includes("--defaults");
const repo = resolve(argument(args, "--repo") ?? process.cwd());
const keysRaw = argument(args, "--keys");
const keys = keysRaw === undefined ? undefined : keysRaw.split(",").map((key) => key.trim()).filter((key) => key.length > 0);

const parsed = parseYaml(readFileSync(0, "utf8"));
if (parsed.value === undefined) {
  console.error("invalid YAML:");
  for (const error of parsed.errors) console.error(`  - ${error}`);
  process.exit(EXIT_INVALID);
}

const result = writePlatformConfig(repo, process.env, parsed.value, {
  vocabulary: pluginVocabulary(pluginRoot),
  trackerAdapters: trackerAdapterSources(pluginRoot),
  defaults,
  keys,
});

if (result.status !== "ok") {
  console.error("platform config write failed:");
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(EXIT_INVALID);
}

console.log(`OK: wrote ${result.path}`);
