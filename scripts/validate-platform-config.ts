import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateLegacyPlatform, migrationNotice, readPlatformConfig, type ResolveChoice } from "./lib/nerdway-config.ts";
import { pluginVocabulary, trackerAdapterSources } from "./lib/platform-read.ts";
import { validateAdapterDefaults } from "./types/platform-config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, "..");

const vocabulary = pluginVocabulary(pluginRoot);
const trackerAdapters = trackerAdapterSources(pluginRoot);

const errors: string[] = [];
for (const [name, source] of trackerAdapters) {
  errors.push(...validateAdapterDefaults(name, source, vocabulary));
}

const EXIT_FOUND = 0;
const EXIT_ABSENT = 3;
const EXIT_INVALID = 4;
const EXIT_MIGRATION = 5;
const RESOLVE = new Set<ResolveChoice>(["keep-user", "take-repo", "merge"]);

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const args = process.argv.slice(2);
const print = args.includes("--print");
const resolveArg = argument(args, "--resolve");
const positional = args.filter((arg, index) => arg !== "--print" && arg !== "--resolve" && args[index - 1] !== "--resolve");
const target = resolve(positional[0] ?? pluginRoot);
const sources = { vocabulary, trackerAdapters };

if (resolveArg !== undefined) {
  if (!RESOLVE.has(resolveArg as ResolveChoice)) {
    console.error("--resolve must be keep-user, take-repo or merge");
    process.exit(1);
  }
  const migrated = migrateLegacyPlatform(target, process.env, { ...sources, resolve: resolveArg as ResolveChoice });
  if (migrated.status === "conflict") {
    console.error(`${target}: migration-needed`);
    for (const error of migrated.errors) console.error(`  - ${error}`);
    process.exit(EXIT_MIGRATION);
  }
  const notice = migrationNotice(migrated);
  if (notice.length > 0) {
    if (print) console.error(notice);
    else console.log(notice);
  }
}

const read = readPlatformConfig(target, process.env, sources);

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
  const label =
    read.status === "absent" ? "no platform config" : read.status === "invalid" ? "invalid platform config" : "migration-needed";
  console.error(`${target}: ${label}`);
  for (const error of read.errors) console.error(`  - ${error}`);
  process.exit(read.status === "absent" ? EXIT_ABSENT : read.status === "invalid" ? EXIT_INVALID : EXIT_MIGRATION);
}

let summary = "";
if (read.status === "found") {
  const strategy = (read.value.statuses as { strategy?: unknown } | undefined)?.strategy;
  summary = `tracker ${String(read.value.tracker)}, vcs ${String(read.value.vcs)}, statuses ${strategy === undefined ? "from the adapter default" : String(strategy)}`;
} else if (read.status === "invalid") {
  errors.push(...read.errors.map((error) => `${target}: ${error}`));
} else if (read.status === "migration-needed") {
  console.error("platform config validation failed:");
  for (const error of [...errors, ...read.errors.map((error) => `${target}: ${error}`)]) console.error(`  - ${error}`);
  process.exit(EXIT_MIGRATION);
}

if (errors.length > 0) {
  console.error("platform config validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const where = summary.length > 0 ? `${target} (${summary})` : `${target} (no user platform config)`;
console.log(`OK: ${where} and ${trackerAdapters.size} tracker adapter defaults validated`);
