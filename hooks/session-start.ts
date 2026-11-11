import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { renderContextOutput, type Runtime } from "../scripts/lib/install-check.ts";
import { resolveSlug } from "../scripts/lib/nerdway-config.ts";

const ALWAYS = new Set(["Purpose", "Stack", "Commands", "Conventions", "Active context"]);

export interface SessionOptions {
  vault: string;
  aliasesPath: string;
  killSwitchPath: string;
  budget: number;
  projectDir: string;
  gitRemote?: (projectDir: string) => string;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function pythonString(text: string): string {
  let out = '"';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === '"') out += '\\"';
    else if (char === "\\") out += "\\\\";
    else if (char === "\b") out += "\\b";
    else if (char === "\f") out += "\\f";
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (code < 0x20 || code > 0x7e) out += pythonCodePoint(code);
    else out += char;
  }
  return `${out}"`;
}

function pythonCodePoint(code: number): string {
  if (code <= 0xffff) return `\\u${code.toString(16).padStart(4, "0")}`;
  const rest = code - 0x10000;
  const high = 0xd800 + (rest >> 10);
  const low = 0xdc00 + (rest & 0x3ff);
  return `\\u${high.toString(16).padStart(4, "0")}\\u${low.toString(16).padStart(4, "0")}`;
}

function sessionJson(context: string): string {
  return `{${pythonString("additional_context")}: ${pythonString(context)}}\n`;
}

function rstripNewlines(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === "\n") end -= 1;
  return text.slice(0, end);
}

export function trimPage(content: string, path: string): string {
  const blocks: Array<{ head: string | null; lines: string[] }> = [];
  let head: string | null = null;
  let lines: string[] = [];
  for (const line of content.split(/(?<=\n)/)) {
    if (line.startsWith("## ")) {
      blocks.push({ head, lines });
      head = line.slice(3).trim();
      lines = [line];
    } else {
      lines.push(line);
    }
  }
  blocks.push({ head, lines });

  const kept: string[] = [];
  const omitted: string[] = [];
  for (const block of blocks) {
    if (block.head === null || ALWAYS.has(block.head)) kept.push(...block.lines);
    else omitted.push(block.head);
  }
  let out = `${rstripNewlines(kept.join(""))}\n`;
  if (omitted.length > 0) {
    out += `\n[omitted: ${omitted.join(", ")} — read ${path} before debugging or when a decision's rationale matters]\n`;
  }
  return out;
}

function decodeDropIncomplete(bytes: Buffer): string {
  let end = bytes.length;
  if (end === 0) return "";
  let index = end - 1;
  let continuation = 0;
  while (index >= 0 && (bytes[index] & 0xc0) === 0x80) {
    continuation += 1;
    index -= 1;
  }
  if (index < 0) return "";
  const lead = bytes[index] ?? 0;
  const needed = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  if (continuation + 1 < needed) end = index;
  return bytes.subarray(0, end).toString("utf8");
}

export function enforceBudget(content: string, budget: number, path: string): string {
  const raw = Buffer.from(content, "utf8");
  if (raw.length <= budget) return content;
  const marker = `\n[truncated — read full page: ${path}]\n`;
  const cut = Math.max(0, budget - Buffer.byteLength(marker));
  return decodeDropIncomplete(raw.subarray(0, cut)) + marker;
}

function insideVault(projectDir: string, vault: string): boolean {
  if (!isDir(vault)) return false;
  try {
    const projectReal = realpathSync(projectDir);
    const vaultReal = realpathSync(vault);
    return `${projectReal}${sep}`.startsWith(`${vaultReal}${sep}`);
  } catch {
    return false;
  }
}

function buildContext(options: SessionOptions): string {
  if (isFile(options.killSwitchPath) || isFile(join(options.projectDir, ".nerdbrain-disabled"))) return "";
  if (insideVault(options.projectDir, options.vault)) return "";

  const slug = resolveSlug(options.projectDir, {
    aliasesPath: options.aliasesPath,
    gitRemote: options.gitRemote,
  });
  const tier = isDir(options.vault) ? "file" : "none";
  const pagePath = join(options.vault, "5-wiki", "entities", "projects", `${slug}.md`);
  let page = readText(pagePath) ?? "";
  if (page.length > 0) page = rstripNewlines(trimPage(page, pagePath));

  let ctx = "## Nerdbrain second brain — session context\n\n";
  ctx += `slug: \`${slug}\`\n`;
  ctx += `tier: \`${tier}\`\n`;
  ctx += "\n";
  if (page.length > 0) {
    ctx += "## Project page from nerdbrain wiki\n\n";
    ctx += `${page}\n\n`;
    ctx += `_Path: \`5-wiki/entities/projects/${slug}.md\`. To update it, follow the write triggers in user rules / AGENTS.md / CLAUDE.md and invoke the \`nerdbrain-wiki\` skill for the procedure._\n`;
  } else if (tier === "none") {
    ctx += "## Nerdbrain vault not on this machine\n\n";
    ctx += `No vault directory here. If \`ToolSearch\` with the query \`+nerdbrain\` lists \`mcp__claude_ai_nerdbrain__*\` tools, the tier is \`mcp\`: read the sections ${[...ALWAYS].join(", ")} of \`5-wiki/entities/projects/${slug}.md\` with the operation \`page.read-section\` of the nerdway plugin's \`adapters/vault/mcp.md\`, one section at a time, by the heading path \`<H1>::<Section>\`, where \`<H1>\` is the page's H1 text from the document map (\`page.read\`), not the slug. Without those tools the tier stays \`none\` and the wiki is off for this session.\n`;
  } else {
    ctx += "## Project not yet in nerdbrain wiki\n\n";
    ctx += `No page at \`5-wiki/entities/projects/${slug}.md\` yet. Build understanding during the session and, when a write trigger fires (see user rules / AGENTS.md / CLAUDE.md), invoke the \`nerdbrain-wiki\` skill to create it.\n`;
  }
  return rstripNewlines(enforceBudget(ctx, options.budget, pagePath));
}

export function renderSession(options: SessionOptions): string {
  return sessionJson(buildContext(options));
}

export function renderSessionOutput(options: SessionOptions, runtime: Runtime): string {
  if (runtime === "cursor") return renderSession(options);
  return renderContextOutput(buildContext(options), "claude", { event: "SessionStart" });
}

export function projectDirectory(raw: string, cwd: string): string {
  if (raw.trim().length === 0) return cwd;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return cwd;
    const input = parsed as { cwd?: unknown; workspace_roots?: unknown };
    if (typeof input.cwd === "string" && input.cwd.length > 0) return input.cwd;
    const roots = input.workspace_roots;
    if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0].length > 0) return roots[0];
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return cwd;
}

function budgetFrom(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 8192;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 8192;
  return parsed;
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  const raw = readFileSync(0, "utf8");
  const home = homedir();
  const args = process.argv.slice(2);
  const runtime: Runtime = args[args.indexOf("--runtime") + 1] === "cursor" ? "cursor" : "claude";
  const options: SessionOptions = {
    vault: process.env.NERDBRAIN_VAULT ?? join(home, "obsidian", "nerdbrain"),
    aliasesPath: process.env.NERDBRAIN_ALIASES ?? join(home, ".claude", "nerdbrain.aliases"),
    killSwitchPath: join(home, ".claude", "nerdbrain.disabled"),
    budget: budgetFrom(process.env.NERDBRAIN_INJECT_BUDGET),
    projectDir: projectDirectory(raw, process.cwd()),
  };
  process.stdout.write(renderSessionOutput(options, runtime));
}
