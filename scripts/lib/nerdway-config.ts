import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import {
  emitYaml,
  parseYaml,
  readPlatform,
  validatePlatformConfig,
  type PlatformRead,
  type PlatformVocabulary,
} from "../types/platform-config.ts";

export interface ResolveSlugOptions {
  aliasesPath?: string;
  gitRemote?: (projectDir: string) => string;
}

export interface ReadPlatformOptions {
  vocabulary: PlatformVocabulary;
  trackerAdapters: ReadonlyMap<string, string>;
  platform?: NodeJS.Platform;
  home?: string;
  aliasesPath?: string;
  gitRemote?: (projectDir: string) => string;
}

export interface WritePlatformOptions extends ReadPlatformOptions {
  defaults?: boolean;
  keys?: string[];
}

export type WritePlatformResult = { status: "ok"; path: string } | { status: "invalid"; errors: string[] };

function trimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

export function resolveConfigDir(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  home: string,
): string {
  const override = trimmed(env.NERDWAY_CONFIG_DIR);
  if (override !== undefined) return override;
  const xdg = trimmed(env.XDG_CONFIG_HOME);
  if (xdg !== undefined) return join(xdg, "nerdway");
  if (platform === "win32") {
    const appdata = trimmed(env.APPDATA);
    if (appdata !== undefined) return join(appdata, "nerdway");
  }
  return join(home, ".config", "nerdway");
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
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

function slugFromFile(text: string): string {
  const line = text.split("\n", 1)[0] ?? "";
  return line.replace(/[^a-z0-9-]/g, "").slice(0, 200);
}

function aliasFor(host: string, aliases: string): string {
  const line = aliases.split("\n").find((item) => item.startsWith(`${host}=`));
  if (line === undefined) return "";
  const value = line.slice(host.length + 1).split("=")[0] ?? "";
  return value.replace(/[^a-z0-9-]/g, "");
}

function stripRemotePrefix(url: string): string {
  const https = `https:${"/".repeat(2)}`;
  const http = `http:${"/".repeat(2)}`;
  if (url.startsWith("git@")) return url.slice(4);
  if (url.startsWith(https)) return url.slice(https.length);
  if (url.startsWith(http)) return url.slice(http.length);
  return url;
}

function slugFromRemote(url: string, aliases: string | null): string {
  let cleaned = stripRemotePrefix(url);
  const colon = cleaned.indexOf(":");
  if (colon !== -1) cleaned = `${cleaned.slice(0, colon)}/${cleaned.slice(colon + 1)}`;
  cleaned = cleaned.replace(/\.git$/, "");
  if (aliases !== null) {
    const slash = cleaned.indexOf("/");
    const host = slash === -1 ? cleaned : cleaned.slice(0, slash);
    const alias = aliasFor(host, aliases);
    if (alias.length > 0) {
      const rest = slash === -1 ? cleaned : cleaned.slice(slash + 1);
      cleaned = `${alias}/${rest}`;
    }
  }
  return cleaned.replace(/[/.]/g, "-").toLowerCase();
}

function gitRemote(projectDir: string): string {
  try {
    return execFileSync("git", ["-C", projectDir, "config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function resolveSlug(projectDir: string, options: ResolveSlugOptions = {}): string {
  const slugPath = join(projectDir, ".nerdbrain-slug");
  if (isFile(slugPath)) return slugFromFile(readText(slugPath) ?? "");
  const remote = (options.gitRemote ?? gitRemote)(projectDir).trim();
  if (remote.length > 0) return slugFromRemote(remote, options.aliasesPath === undefined ? null : readText(options.aliasesPath));
  return basename(projectDir).toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function mergePlatformConfigs(
  defaults: Record<string, unknown>,
  project: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaults, ...project };
}

type YamlFile =
  | { kind: "missing" }
  | { kind: "ok"; value: Record<string, unknown> }
  | { kind: "invalid"; errors: string[] };

function readYamlFile(path: string): YamlFile {
  if (!isFile(path)) return { kind: "missing" };
  const parsed = parseYaml(readFileSync(path, "utf8"));
  if (parsed.value === undefined) return { kind: "invalid", errors: parsed.errors };
  return { kind: "ok", value: parsed.value };
}

export function readPlatformConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: ReadPlatformOptions,
): PlatformRead {
  const markdown = isFile(join(repoRoot, "CLAUDE.md")) ? readFileSync(join(repoRoot, "CLAUDE.md"), "utf8") : undefined;
  const legacy = readPlatform(markdown, options.vocabulary, options.trackerAdapters);
  if (legacy.status !== "absent") {
    return {
      status: "migration-needed",
      errors: legacy.status === "invalid" ? legacy.errors : ["legacy ## Platform section in CLAUDE.md"],
    };
  }

  const home = options.home ?? homedir();
  const configDir = resolveConfigDir(env, options.platform ?? process.platform, home);
  const slug = resolveSlug(repoRoot, { aliasesPath: options.aliasesPath, gitRemote: options.gitRemote });
  const defaults = readYamlFile(join(configDir, "config.yml"));
  const project = slug.length === 0 ? { kind: "missing" as const } : readYamlFile(join(configDir, slug, "config.yml"));
  if (defaults.kind === "invalid") return { status: "invalid", errors: defaults.errors.map((error) => `config.yml: ${error}`) };
  if (project.kind === "invalid") return { status: "invalid", errors: project.errors.map((error) => `${slug}/config.yml: ${error}`) };
  if (defaults.kind === "missing" && project.kind === "missing") {
    return { status: "absent", errors: ["no platform config"] };
  }
  const value = mergePlatformConfigs(defaults.kind === "ok" ? defaults.value : {}, project.kind === "ok" ? project.value : {});
  const errors = validatePlatformConfig(value, options.vocabulary, options.trackerAdapters.get(String(value.tracker)));
  if (errors.length > 0) return { status: "invalid", errors };
  return { status: "found", value, errors: [] };
}

function configPaths(repoRoot: string, env: NodeJS.ProcessEnv, options: ReadPlatformOptions): { configDir: string; slug: string } {
  const home = options.home ?? homedir();
  return {
    configDir: resolveConfigDir(env, options.platform ?? process.platform, home),
    slug: resolveSlug(repoRoot, { aliasesPath: options.aliasesPath, gitRemote: options.gitRemote }),
  };
}

export function writePlatformConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  input: Record<string, unknown>,
  options: WritePlatformOptions,
): WritePlatformResult {
  const { configDir, slug } = configPaths(repoRoot, env, options);
  const defaultsPath = join(configDir, "config.yml");
  const projectPath = join(configDir, slug, "config.yml");
  const defaults = readYamlFile(defaultsPath);
  const existing = readYamlFile(projectPath);
  if (defaults.kind === "invalid") return { status: "invalid", errors: defaults.errors.map((error) => `config.yml: ${error}`) };
  if (existing.kind === "invalid") return { status: "invalid", errors: existing.errors.map((error) => `${slug}/config.yml: ${error}`) };

  if (options.defaults) {
    const nextDefaults = input;
    const project = existing.kind === "ok" ? existing.value : {};
    const merged = mergePlatformConfigs(nextDefaults, project);
    if (existing.kind === "ok" || Object.keys(project).length > 0) {
      const errors = validatePlatformConfig(merged, options.vocabulary, options.trackerAdapters.get(String(merged.tracker)));
      if (errors.length > 0) return { status: "invalid", errors };
    } else {
      const errors = validatePlatformConfig(nextDefaults, options.vocabulary, options.trackerAdapters.get(String(nextDefaults.tracker)));
      if (errors.length > 0) return { status: "invalid", errors };
    }
    mkdirSync(configDir, { recursive: true });
    writeFileSync(defaultsPath, emitYaml(nextDefaults));
    return { status: "ok", path: defaultsPath };
  }

  if (slug.length === 0) return { status: "invalid", errors: ["project slug is empty"] };
  let nextProject = input;
  if (options.keys !== undefined) {
    const current = existing.kind === "ok" ? existing.value : {};
    const patch: Record<string, unknown> = {};
    for (const key of options.keys) {
      if (Object.hasOwn(input, key)) patch[key] = input[key];
    }
    nextProject = { ...current, ...patch };
  }
  const merged = mergePlatformConfigs(defaults.kind === "ok" ? defaults.value : {}, nextProject);
  const errors = validatePlatformConfig(merged, options.vocabulary, options.trackerAdapters.get(String(merged.tracker)));
  if (errors.length > 0) return { status: "invalid", errors };
  mkdirSync(join(configDir, slug), { recursive: true });
  writeFileSync(projectPath, emitYaml(nextProject));
  return { status: "ok", path: projectPath };
}
