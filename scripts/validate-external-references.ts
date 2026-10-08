import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { externalReferenceSources, validateExternalReferences } from "./types/external-references.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validateExternalReferences(repoRoot);

if (errors.length > 0) {
  console.error("external reference validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: ${externalReferenceSources(repoRoot).length} tracked files checked; no call to a superpowers or mattpocock-skills skill outside the exempt paths`);
