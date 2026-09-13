import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractInlineSchemas, validateContract, type AdapterFile, type InlineSchemaUse } from "./types/workflow-graph.ts";

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

const adaptersDir = join(repoRoot, "adapters");
const adapterFiles: AdapterFile[] = [];
if (existsSync(adaptersDir)) {
  for (const axis of readdirSync(adaptersDir, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    for (const file of readdirSync(join(adaptersDir, axis.name)).filter((name) => name.endsWith(".md"))) {
      const source = readFileSync(join(adaptersDir, axis.name, file), "utf8");
      adapterFiles.push({ axis: axis.name, name: file.slice(0, -".md".length), source });
    }
  }
}

const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "workflow-graph.json"), "utf8"));
const errors = validateContract(raw, skillDirs, inlineSchemas, scriptFiles, adapterFiles);

if (errors.length > 0) {
  console.error("workflow-graph.json validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const { nodes } = raw as { nodes: unknown[] };
console.log(`OK: ${nodes.length} nodes, ${inlineSchemas.length} inlined workflow schemas and ${adapterFiles.length} adapters validated`);
