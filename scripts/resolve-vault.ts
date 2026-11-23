import { resolve } from "node:path";

import { HOST_IDS, type HostId } from "./lib/host-detect.ts";
import { resolveVault } from "./lib/nerdway-config.ts";

const EXIT_USAGE = 2;
const EXIT_INVALID = 4;

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const repoArg = argument(args, "--repo");
const hostArg = argument(args, "--host");
const valued = new Set(["--repo", "--host"]);
const positional = args.filter((arg, index) => arg !== "--json" && !valued.has(arg) && !valued.has(args[index - 1] ?? ""));
const repo = resolve(repoArg ?? positional[0] ?? process.cwd());

if (hostArg !== undefined && !(HOST_IDS as readonly string[]).includes(hostArg)) {
  console.error(`resolve-vault: unknown host "${hostArg}"; expected one of ${HOST_IDS.join(", ")}`);
  process.exit(EXIT_USAGE);
}

const result = resolveVault(repo, process.env, { host: hostArg as HostId | undefined });

if (result.status !== "ok") {
  console.error("resolve-vault failed:");
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(EXIT_INVALID);
}

if (json) {
  const { path, source, exists, live, machine, reason } = result;
  console.log(JSON.stringify({ path, source, exists, live, machine, reason }));
} else {
  console.log(result.path);
}
