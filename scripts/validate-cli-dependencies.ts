import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateContract } from "./types/cli-dependencies.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const skillDirs = readdirSync(join(repoRoot, "skills"), { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "cli-dependencies.json"), "utf8"));
const errors = validateContract(raw, skillDirs);

if (errors.length > 0) {
  console.error("cli-dependencies.json validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${(raw as { clis: unknown[] }).clis.length} CLI entries validated`);
