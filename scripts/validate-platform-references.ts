import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORM_RECIPE, platformReaders, validatePlatformReferences } from "./types/platform-references.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validatePlatformReferences(repoRoot);

if (errors.length > 0) {
  console.error("platform reference validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${platformReaders(repoRoot).length} skills, agents and adapters checked; every ## Platform mention points at ${PLATFORM_RECIPE}`);
