import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sectionBody, tableRows } from "./types/workflow-graph.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(repoRoot, path), "utf8");

const SKILLS = ["skills/nerdbrain-wiki/SKILL.md", "skills/nerdbrain-search/SKILL.md"];
const FILE_ADAPTER = "adapters/vault/file.md";
const MCP_ADAPTER = "adapters/vault/mcp.md";
const CONNECTOR_PREFIX = "mcp__claude_ai_nerdbrain__";

const VAULT_OPERATIONS = [
  "page.read",
  "page.read-section",
  "page.replace-section",
  "page.append-section",
  "page.prepend-capped",
  "page.create",
  "page.bump-updated",
  "vault.search",
  "index.append",
  "log.append",
  "graph.links",
  "graph.backlinks",
  "graph.hop1",
];

const INLINE_TRANSPORT_RECIPE = /^\s*rg |Edit \$PAGE|Write \$PAGE/;
const HEADING_TARGET = /targetType:\s*"heading"/;
const UNSUPPORTED = "—";

function operationRows(adapter: string): string[][] {
  const table = sectionBody(read(adapter), "Operations");
  assert.ok(table !== undefined, `${adapter} needs a ## Operations section`);
  return tableRows(table);
}

for (const skill of SKILLS) {
  test(`${skill} quotes no transport recipe inline`, () => {
    const offenders = read(skill)
      .split("\n")
      .filter((line) => INLINE_TRANSPORT_RECIPE.test(line));
    assert.deepEqual(offenders, []);
  });

  test(`${skill} points at the vault adapters`, () => {
    assert.match(read(skill), /adapters\/vault/);
  });
}

test(`${FILE_ADAPTER} lists exactly the vault operations`, () => {
  assert.ok(existsSync(join(repoRoot, FILE_ADAPTER)));
  assert.deepEqual(operationRows(FILE_ADAPTER).map((row) => row[0]), VAULT_OPERATIONS);
});

test(`${FILE_ADAPTER} is the only vault adapter that runs rg`, () => {
  assert.match(read(FILE_ADAPTER), /\brg /);
  assert.doesNotMatch(read(MCP_ADAPTER), /\brg /);
});

test(`${MCP_ADAPTER} lists the same operations as ${FILE_ADAPTER}`, () => {
  assert.ok(existsSync(join(repoRoot, MCP_ADAPTER)));
  assert.deepEqual(operationRows(MCP_ADAPTER).map((row) => row[0]), VAULT_OPERATIONS);
});

test(`${MCP_ADAPTER} addresses every heading target by its full heading path`, () => {
  const headingRows = operationRows(MCP_ADAPTER).filter((row) => HEADING_TARGET.test(row[1]));
  assert.ok(headingRows.length >= 5, "the section reads and patches target headings");
  for (const row of headingRows) assert.match(row[1], /::/, `${row[0]} targets a heading without the H1 root`);
});

test(`${MCP_ADAPTER} never reads a whole page`, () => {
  const wholePageReads = operationRows(MCP_ADAPTER).filter((row) => /vault_read/.test(row[1]) && !/target:/.test(row[1]));
  assert.deepEqual(wholePageReads.map((row) => row[0]), []);
});

test(`${MCP_ADAPTER} marks the graph operations unsupported`, () => {
  const graphRecipes = operationRows(MCP_ADAPTER)
    .filter((row) => row[0].startsWith("graph."))
    .map((row) => row[1]);
  assert.deepEqual(graphRecipes, [UNSUPPORTED, UNSUPPORTED, UNSUPPORTED]);
});

test(`${MCP_ADAPTER} carries no connector credential`, () => {
  assert.doesNotMatch(read(MCP_ADAPTER), /bearer|api[ _-]?key|secret/i);
});

for (const file of [...SKILLS, MCP_ADAPTER]) {
  test(`${file} names the connector tool prefix the tier probe looks for`, () => {
    assert.ok(read(file).includes(CONNECTOR_PREFIX));
  });
}

const GATHERER = "agents/plan-gatherer.md";
const GATHERER_READ_OPERATIONS = ["page.read", "page.read-section", "vault.search"];

function connectorTools(recipe: string): string[] {
  return [...recipe.matchAll(/\b(vault_[a-z_]+|search_[a-z_]+)\b/g)].map((match) => CONNECTOR_PREFIX + match[1]);
}

function gathererTools(): string[] {
  const line = read(GATHERER)
    .split("\n")
    .find((candidate) => candidate.startsWith("tools:"));
  assert.ok(line !== undefined, `${GATHERER} needs a tools: frontmatter line`);
  return line
    .slice("tools:".length)
    .split(",")
    .map((tool) => tool.trim());
}

test(`${GATHERER} can load and call every connector tool the mcp read operations use`, () => {
  const tools = gathererTools();
  assert.ok(tools.includes("ToolSearch"), "the connector tools stay deferred, so the gatherer needs ToolSearch");
  const rows = operationRows(MCP_ADAPTER).filter((row) => GATHERER_READ_OPERATIONS.includes(row[0]));
  assert.equal(rows.length, GATHERER_READ_OPERATIONS.length);
  for (const row of rows) {
    for (const tool of connectorTools(row[1])) assert.ok(tools.includes(tool), `${row[0]} calls ${tool}`);
  }
});

test(`${GATHERER} holds no connector tool outside the mcp read operations`, () => {
  const readTools = new Set(
    operationRows(MCP_ADAPTER)
      .filter((row) => GATHERER_READ_OPERATIONS.includes(row[0]))
      .flatMap((row) => connectorTools(row[1])),
  );
  const offenders = gathererTools().filter((tool) => tool.startsWith(CONNECTOR_PREFIX) && !readTools.has(tool));
  assert.deepEqual(offenders, []);
});
