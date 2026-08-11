import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractInlineSchemas, validateContract, type InlineSchemaUse } from "./types/workflow-graph.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const skillDirs = readdirSync(join(repoRoot, "skills"), { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

const workflowsDir = join(repoRoot, "workflows");
const inlineSchemas: InlineSchemaUse[] = [];
const scriptFiles: string[] = [];
if (existsSync(workflowsDir)) {
  for (const file of readdirSync(workflowsDir).filter((name) => name.endsWith(".js"))) {
    scriptFiles.push(`workflows/${file}`);
    const source = readFileSync(join(workflowsDir, file), "utf8");
    inlineSchemas.push(...extractInlineSchemas(`workflows/${file}`, source));
  }
}

const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "workflow-graph.json"), "utf8"));
const errors = validateContract(raw, skillDirs, inlineSchemas, scriptFiles);

if (errors.length > 0) {
  console.error("workflow-graph.json validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const { nodes } = raw as { nodes: unknown[] };
console.log(`OK: ${nodes.length} nodes and ${inlineSchemas.length} inlined workflow schemas validated`);
