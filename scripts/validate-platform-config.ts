import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPlatform, validateAdapterDefaults, type PlatformVocabulary } from "./types/platform-config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

interface Property {
  enum?: string[];
  required?: string[];
  properties?: Record<string, Property>;
}

const contract = JSON.parse(readFileSync(join(repoRoot, "workflow-graph.json"), "utf8")) as {
  schemas: { id: string; schema: Property }[];
};
const platform = contract.schemas.find((entry) => entry.id === "PlatformConfig")?.schema.properties ?? {};
const statuses = platform.statuses?.properties ?? {};
const vocabulary: PlatformVocabulary = {
  trackers: platform.tracker?.enum ?? [],
  vcs: platform.vcs?.enum ?? [],
  strategies: statuses.strategy?.enum ?? [],
  phases: statuses.map?.required ?? [],
};

const errors: string[] = [];

const trackersDir = join(repoRoot, "adapters", "trackers");
const trackerAdapters = new Map<string, string>();
for (const file of readdirSync(trackersDir).filter((name) => name.endsWith(".md"))) {
  const name = file.slice(0, -".md".length);
  const source = readFileSync(join(trackersDir, file), "utf8");
  trackerAdapters.set(name, source);
  errors.push(...validateAdapterDefaults(name, source, vocabulary));
}

const EXIT_FOUND = 0;
const EXIT_ABSENT = 3;
const EXIT_INVALID = 4;

const args = process.argv.slice(2);
const print = args.includes("--print");
const target = resolve(args.find((arg) => arg !== "--print") ?? join(repoRoot, "CLAUDE.md"));
const read = readPlatform(existsSync(target) ? readFileSync(target, "utf8") : undefined, vocabulary, trackerAdapters);

if (print) {
  if (errors.length > 0) {
    console.error("plugin tracker adapter defaults are broken:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  if (read.status === "found") {
    console.log(JSON.stringify(read.value, null, 2));
    process.exit(EXIT_FOUND);
  }
  console.error(`${target}: ${read.status === "absent" ? "no platform config" : "invalid platform config"}`);
  for (const error of read.errors) console.error(`  - ${error}`);
  process.exit(read.status === "absent" ? EXIT_ABSENT : EXIT_INVALID);
}

let summary = "";
if (read.status === "found") {
  const strategy = (read.value.statuses as { strategy?: unknown } | undefined)?.strategy;
  summary = `tracker ${String(read.value.tracker)}, vcs ${String(read.value.vcs)}, statuses ${strategy === undefined ? "from the adapter default" : String(strategy)}`;
} else {
  errors.push(...read.errors.map((error) => `${target}: ${error}`));
}

if (errors.length > 0) {
  console.error("platform config validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${target} (${summary}) and ${trackerAdapters.size} tracker adapter defaults validated`);
