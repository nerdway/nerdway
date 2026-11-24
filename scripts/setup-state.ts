import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkById, loadCoreChecks } from "./lib/setup-checks.ts";
import { buildSetupState, preflightSummary, setupContext } from "./lib/setup-state.ts";

// The state nerdway-setup works from, as JSON. Read only.
//
//   node scripts/setup-state.ts [<dir>]                              every check
//   node scripts/setup-state.ts --preflight --caller <skill> [<dir>] the quick pass
//   node scripts/setup-state.ts --check <id> [<dir>]                 one check
//
// Exit 0 with JSON on stdout; 2 on a usage error or an unknown check id;
// 4 when the check registry breaks its contract.

const EXIT_USAGE = 2;
const EXIT_REGISTRY = 4;
const VALUED = new Set(["--caller", "--check"]);

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const preflight = args.includes("--preflight");
const caller = argument(args, "--caller");
const only = argument(args, "--check");
const positional = args.filter((arg, index) => !arg.startsWith("--") && !VALUED.has(args[index - 1] ?? ""));
const dir = resolve(positional[0] ?? process.cwd());

if ((preflight && (caller === undefined || caller.startsWith("--"))) || (preflight && only !== undefined)) {
  console.error("usage: setup-state.ts [--preflight --caller <skill> | --check <id>] [<dir>]");
  process.exit(EXIT_USAGE);
}

const registry = loadCoreChecks(pluginRoot);
if (registry.errors.length > 0) {
  console.error("setup-state: the check registry breaks its contract:");
  for (const error of registry.errors) console.error(`  - ${error}`);
  process.exit(EXIT_REGISTRY);
}

let checks = registry.checks;
if (only !== undefined) {
  const found = checkById(checks, only);
  checks = found === undefined ? [] : [found];
  if (found === undefined) {
    console.error(`setup-state: no check with id ${JSON.stringify(only)}; known: ${registry.checks.map((check) => check.id).join(", ")}`);
    process.exit(EXIT_USAGE);
  }
}

const state = buildSetupState(setupContext(dir, pluginRoot), checks);
const output = preflight ? preflightSummary(state, caller ?? "") : only !== undefined ? state.checks[0] : state;
console.log(JSON.stringify(output, null, 2));
