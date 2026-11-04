import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scrubCheckSources, validateScrubCheck } from "./types/scrub-check.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validateScrubCheck(repoRoot);

if (errors.length > 0) {
  console.error("scrub-check failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${scrubCheckSources(repoRoot).length} tracked files checked; no private-track strings outside the dual-track guide and this checker`);
