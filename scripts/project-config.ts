import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { hasProjectConfigPath, projectConfigLocation } from "./lib/config-location.ts";
import { readSection, writeSection } from "./lib/config-sections.ts";
import { moveProjectConfig } from "./lib/nerdway-config.ts";

// The config edits nerdway-setup owns, with a before/after on stdout as JSON.
//
//   node scripts/project-config.ts where [<repo>]
//   node scripts/project-config.ts move --to user|repo [<repo>]
//   node scripts/project-config.ts set wiki.path <value> --layer defaults|project [<repo>]
//
// `move` switches the project config between `<config dir>/<slug>/config.yml`
// (user) and `<repo>/.nerdway/config.yml` (repo) and never overwrites. `set`
// changes only that key in that file and keeps every other key and comment.

const EXIT_USAGE = 2;
const EXIT_REFUSED = 4;
const VALUED = new Set(["--to", "--layer"]);

const USAGE =
  "usage: project-config.ts where [<repo>] | move --to user|repo [<repo>] | set wiki.path <value> --layer defaults|project [<repo>]";

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

function refuse(errors: string[]): never {
  console.error("project-config: refused:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(EXIT_REFUSED);
}

function wikiPathAt(repo: string, layer: "defaults" | "project"): string | null {
  const read = readSection("wiki", { repoRoot: repo, env: process.env, layer });
  if (read.status !== "found" || typeof read.value !== "object" || read.value === null) return null;
  const path = (read.value as Record<string, unknown>).path;
  return typeof path === "string" ? path : null;
}

const args = process.argv.slice(2);
const command = args[0];
const positional = args.slice(1).filter((arg, index, rest) => !VALUED.has(arg) && !VALUED.has(rest[index - 1] ?? ""));

if (command === "where") {
  const repo = resolve(positional[0] ?? process.cwd());
  const location = projectConfigLocation(repo, process.env);
  const exists = hasProjectConfigPath(location) && existsSync(location.path);
  console.log(JSON.stringify({ strategy: location.strategy, path: location.path, exists }));
} else if (command === "move") {
  const to = argument(args, "--to");
  if (to !== "user" && to !== "repo") {
    console.error(USAGE);
    process.exit(EXIT_USAGE);
  }
  const repo = resolve(positional[0] ?? process.cwd());
  const result = moveProjectConfig(repo, process.env, to);
  if (result.status === "refused") refuse(result.errors);
  if (result.status === "moved") console.log(JSON.stringify({ status: "moved", strategy: to, before: result.from, after: result.to }));
  else console.log(JSON.stringify({ status: result.status, strategy: to, path: result.path }));
} else if (command === "set" && positional[0] === "wiki.path" && positional[1] !== undefined) {
  const layer = argument(args, "--layer");
  if (layer !== "defaults" && layer !== "project") {
    console.error(USAGE);
    process.exit(EXIT_USAGE);
  }
  const value = positional[1];
  const repo = resolve(positional[2] ?? process.cwd());
  const before = wikiPathAt(repo, layer);
  const current = readSection("wiki", { repoRoot: repo, env: process.env, layer });
  const rest = current.status === "found" && typeof current.value === "object" && current.value !== null ? current.value : {};
  const written = writeSection("wiki", { ...rest, path: value }, { repoRoot: repo, env: process.env, target: layer });
  if (written.status !== "ok") refuse(written.errors);
  console.log(JSON.stringify({ status: "set", key: "wiki.path", layer, path: written.path, before, after: value }));
} else {
  console.error(USAGE);
  process.exit(EXIT_USAGE);
}
