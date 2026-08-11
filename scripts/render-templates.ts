import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildTemplates } from "./types/templates.ts";
import type { GraphContract } from "./types/workflow-graph.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(join(repoRoot, "workflow-graph.json"), "utf8")) as GraphContract;

for (const template of buildTemplates(contract)) {
  writeFileSync(join(repoRoot, template.path), template.content);
  console.log(`wrote ${template.path}`);
}
