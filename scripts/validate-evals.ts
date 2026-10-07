import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { SkillEvalsFile } from "./types/evals.ts";
import { findEvalsFiles, validateEvalsFile } from "./types/evals.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;

for (const evalsPath of findEvalsFiles(repoRoot)) {
  const path = relative(repoRoot, evalsPath);
  const raw = JSON.parse(readFileSync(evalsPath, "utf8")) as SkillEvalsFile;
  const errors = validateEvalsFile(raw);

  if (errors.length > 0) {
    failed = true;
    console.error(`${path} validation failed:`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    continue;
  }

  console.log(
    `OK: ${raw.skill_name} has ${raw.evals.length} eval case(s) with assertions (${path})`,
  );
}

if (failed) {
  process.exit(1);
}
