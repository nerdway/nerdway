import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { contextTermSources, validateContextTerms } from "./types/context-terms.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validateContextTerms(repoRoot);

if (errors.length > 0) {
  console.error("glossary term validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`OK: every \`## Language\` term of CONTEXT.md is used in at least one of ${contextTermSources(repoRoot).length} tracked files outside CONTEXT.md and docs/research/`);
