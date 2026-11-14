import { resolve } from "node:path";

import { resolveVault } from "./lib/nerdway-config.ts";

const EXIT_INVALID = 4;

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const repoArg = argument(args, "--repo");
const positional = args.filter((arg, index) => arg !== "--json" && arg !== "--repo" && args[index - 1] !== "--repo");
const repo = resolve(repoArg ?? positional[0] ?? process.cwd());

const result = resolveVault(repo, process.env);

if (result.status !== "ok") {
  console.error("resolve-vault failed:");
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(EXIT_INVALID);
}

if (json) {
  console.log(JSON.stringify({ path: result.path, source: result.source, exists: result.exists }));
} else {
  console.log(result.path);
}
