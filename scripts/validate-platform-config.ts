import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseYaml,
  platformYaml,
  validateAdapterDefaults,
  validatePlatformConfig,
  type PlatformVocabulary,
} from "./types/platform-config.ts";

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

const target = resolve(process.argv[2] ?? join(repoRoot, "CLAUDE.md"));
let summary = "";
if (!existsSync(target)) {
  errors.push(`${target}: file not found`);
} else {
  const section = platformYaml(readFileSync(target, "utf8"));
  const parsed = section.yaml === undefined ? { errors: section.errors } : parseYaml(section.yaml);
  if (parsed.value === undefined) {
    errors.push(...parsed.errors.map((error) => `${target}: ${error}`));
  } else {
    const tracker = String(parsed.value.tracker);
    errors.push(...validatePlatformConfig(parsed.value, vocabulary, trackerAdapters.get(tracker)).map((error) => `${target}: ${error}`));
    const strategy = (parsed.value.statuses as { strategy?: unknown } | undefined)?.strategy;
    summary = `tracker ${tracker}, vcs ${String(parsed.value.vcs)}, statuses ${strategy === undefined ? "from the adapter default" : String(strategy)}`;
  }
}

if (errors.length > 0) {
  console.error("platform config validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${target} (${summary}) and ${trackerAdapters.size} tracker adapter defaults validated`);
