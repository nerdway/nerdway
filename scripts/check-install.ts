import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cacheEntry,
  cachedMainVersion,
  detectVersionDrift,
  fetchMainVersion,
  findStaleSkillCopies,
  renderHookOutput,
  type Finding,
  type Runtime,
  type SkillEntry,
} from "./lib/install-check.ts";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function runtimeFromArgs(argv: string[]): Runtime {
  const index = argv.indexOf("--runtime");
  return argv[index + 1] === "cursor" ? "cursor" : "claude";
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  return raw;
}

function projectDir(stdin: string): string {
  try {
    const input = JSON.parse(stdin) as { cwd?: unknown; workspace_roots?: unknown };
    if (typeof input.cwd === "string" && input.cwd.length > 0) return input.cwd;
    const roots = input.workspace_roots;
    if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0].length > 0) return roots[0];
  } catch {
    return process.cwd();
  }
  return process.cwd();
}

function installedVersion(): string {
  const manifest = JSON.parse(readFileSync(join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8")) as {
    version: string;
  };
  return manifest.version;
}

function cacheDir(): string {
  if (process.env.NERD4RENT_CACHE_DIR) return process.env.NERD4RENT_CACHE_DIR;
  if (process.env.CLAUDE_PLUGIN_DATA) return process.env.CLAUDE_PLUGIN_DATA;
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "nerd4rent");
}

async function mainVersion(): Promise<string | null> {
  const override = process.env.NERD4RENT_MAIN_VERSION;
  if (override !== undefined) return override.length > 0 ? override : null;

  const cacheFile = join(cacheDir(), "main-version.json");
  const now = Date.now();
  const cached = cachedMainVersion(existsSync(cacheFile) ? readFileSync(cacheFile, "utf8") : null, now);
  if (cached !== null) return cached;

  const fetched = await fetchMainVersion(fetch);
  if (fetched !== null) rememberMainVersion(cacheFile, fetched, now);
  return fetched;
}

function rememberMainVersion(cacheFile: string, version: string, now: number): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, cacheEntry(version, now));
  } catch {
    return;
  }
}

function skillDirs(project: string): string[] {
  const override = process.env.NERD4RENT_SKILL_DIRS;
  if (override !== undefined) return override.split(":").filter((dir) => dir.length > 0);
  const home = homedir();
  return [".claude", ".cursor", ".agents"].flatMap((dot) => [join(home, dot, "skills"), join(project, dot, "skills")]);
}

function skillEntries(dirs: string[]): SkillEntry[] {
  const entries: SkillEntry[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const child of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, child.name);
      const skillFile = join(path, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      entries.push({ path, text: readFileSync(skillFile, "utf8") });
    }
  }
  return entries;
}

function currentSkillNames(): string[] {
  return readdirSync(join(pluginRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function main(): Promise<void> {
  const runtime = runtimeFromArgs(process.argv.slice(2));
  const project = projectDir(await readStdin());

  const findings: Finding[] = [];
  const drift = detectVersionDrift(installedVersion(), await mainVersion());
  if (drift) findings.push(drift);
  findings.push(...findStaleSkillCopies(skillEntries(skillDirs(project)), currentSkillNames()));

  const output = renderHookOutput(findings, runtime, pluginRoot);
  if (output.length > 0) process.stdout.write(`${output}\n`);
}

main().catch(() => undefined);
