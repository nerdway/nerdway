import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { hasProjectConfigPath, projectConfigLocation } from "./lib/config-location.ts";
import { moveProjectConfig } from "./lib/nerdway-config.ts";

// Show where this project's config lives, or switch it between the `user`
// location (`<config dir>/<slug>/config.yml`) and the `repo` location
// (`<repo>/.nerdway/config.yml`). A move never overwrites.
//
//   node scripts/project-config.ts where [<repo>]
//   node scripts/project-config.ts move --to user|repo [<repo>]

const EXIT_USAGE = 2;
const EXIT_REFUSED = 4;

const USAGE = "usage: project-config.ts where [<repo>] | move --to user|repo [<repo>]";

const args = process.argv.slice(2);
const command = args[0];
const toAt = args.indexOf("--to");
const to = toAt === -1 ? undefined : args[toAt + 1];
const positional = args.slice(1).filter((arg, index, rest) => arg !== "--to" && rest[index - 1] !== "--to");
const repo = resolve(positional[0] ?? process.cwd());

if (command === "where") {
  const location = projectConfigLocation(repo, process.env);
  const exists = hasProjectConfigPath(location) && existsSync(location.path);
  console.log(JSON.stringify({ strategy: location.strategy, path: location.path, exists }));
} else if (command === "move" && (to === "user" || to === "repo")) {
  const result = moveProjectConfig(repo, process.env, to);
  if (result.status === "refused") {
    console.error("project-config: move refused:");
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exit(EXIT_REFUSED);
  }
  if (result.status === "unchanged") console.log(JSON.stringify({ status: "unchanged", strategy: to, path: result.path }));
  else console.log(JSON.stringify({ status: "moved", strategy: to, before: result.from, after: result.to }));
} else {
  console.error(USAGE);
  process.exit(EXIT_USAGE);
}
