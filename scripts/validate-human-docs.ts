import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { humanDocSources, validateHumanDocs } from "./types/human-docs.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validateHumanDocs(repoRoot);

if (errors.length > 0) {
  console.error("human documentation validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${humanDocSources(repoRoot).length} documents for humans checked; no em dash`);
