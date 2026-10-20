import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findEvalsFiles, readEvalsFile } from "./types/evals.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;

for (const evalsPath of findEvalsFiles(repoRoot)) {
  const path = relative(repoRoot, evalsPath);
  const { file, errors } = readEvalsFile(evalsPath);

  if (file === undefined) {
    failed = true;
    console.error(`${path} validation failed:`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    continue;
  }

  console.log(
    `OK: ${file.skill_name} has ${file.evals.length} eval case(s) with assertions (${path})`,
  );
}

if (failed) {
  process.exit(1);
}
