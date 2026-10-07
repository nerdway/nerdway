import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SkillEvalsFile } from "./types/evals.ts";
import { validateEvalsFile } from "./types/evals.ts";

const here = dirname(fileURLToPath(import.meta.url));
const evalsPath = join(
  here,
  "..",
  "skills",
  "new-project-workflow",
  "evals",
  "evals.json",
);

const raw = JSON.parse(readFileSync(evalsPath, "utf8")) as SkillEvalsFile;
const errors = validateEvalsFile(raw);

if (errors.length > 0) {
  console.error("evals.json validation failed:");
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(
  `OK: ${raw.skill_name} has ${raw.evals.length} eval case(s) with assertions`,
);
