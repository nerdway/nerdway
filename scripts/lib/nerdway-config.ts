import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

import {
  emitYaml,
  parseYaml,
  readPlatform,
  validatePlatformConfig,
  wikiPathFromConfig,
  type PlatformRead,
  type PlatformVocabulary,
} from "../types/platform-config.ts";

export interface ResolveSlugOptions {
  aliasesPath?: string;
  gitRemote?: (projectDir: string) => string;
}

export interface ConfigLocationOptions {
  platform?: NodeJS.Platform;
  home?: string;
  aliasesPath?: string;
  gitRemote?: (projectDir: string) => string;
}

export interface ReadPlatformOptions extends ConfigLocationOptions {
  vocabulary: PlatformVocabulary;
  trackerAdapters: ReadonlyMap<string, string>;
}

export type VaultSource = "env" | "project" | "defaults" | "default";

export interface ResolveVaultOptions extends ConfigLocationOptions {
  cwd?: string;
}

export type ResolveVaultResult =
  | { status: "ok"; path: string; source: VaultSource; exists: boolean }
  | { status: "invalid"; errors: string[] };

export interface WritePlatformOptions extends ReadPlatformOptions {
  defaults?: boolean;
  keys?: string[];
}

export type WritePlatformResult = { status: "ok"; path: string } | { status: "invalid"; errors: string[] };

export type ResolveChoice = "keep-user" | "take-repo" | "merge";

export interface MigratePlatformOptions extends ReadPlatformOptions {
  resolve?: ResolveChoice;
}

export type MigrationResult =
  | { status: "migrated"; path: string }
  | { status: "stale"; path: string }
  | { status: "stale-differs"; path: string }
  | { status: "unchanged" }
  | { status: "conflict"; errors: string[] };

const RESOLVED_SIDECAR = "legacy-platform.resolved";
const FINGERPRINT = /^[0-9a-f]{64}$/;

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
  const migrated = migrateLegacyPlatform(repoRoot, env, options);
  if (migrated.status === "conflict") return { status: "migration-needed", errors: migrated.errors };

  const { configDir, slug } = configPaths(repoRoot, env, options);
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

function configPaths(repoRoot: string, env: NodeJS.ProcessEnv, options: ConfigLocationOptions): { configDir: string; slug: string } {
  const home = options.home ?? homedir();
  return {
    configDir: resolveConfigDir(env, options.platform ?? process.platform, home),
    slug: resolveSlug(repoRoot, { aliasesPath: options.aliasesPath, gitRemote: options.gitRemote }),
  };
}

function expandUserPath(raw: string, home: string): string {
  const text = raw.trim();
  if (text === "~") return home;
  if (text.startsWith("~/") || text.startsWith(`~${sep}`)) return join(home, text.slice(2));
  return text;
}

function absoluteWikiPath(raw: string, home: string, baseDir: string): string {
  const expanded = expandUserPath(raw, home);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded);
}

function wikiPathFromYaml(file: YamlFile, where: string): { kind: "missing" } | { kind: "ok"; path: string } | { kind: "invalid"; errors: string[] } {
  if (file.kind === "missing") return { kind: "missing" };
  if (file.kind === "invalid") return { kind: "missing" };
  const read = wikiPathFromConfig(file.value);
  if (read.kind === "invalid") return { kind: "invalid", errors: read.errors.map((error) => `${where}: ${error}`) };
  return read;
}

/**
 * Resolve the wiki / vault directory.
 *
 * Order: env `NERDWAY_WIKI`, then legacy env `NERDBRAIN_VAULT`; then
 * `wiki.path` in `<configDir>/<slug>/config.yml`, then in
 * `<configDir>/config.yml` (`~` expanded, relative paths against
 * `configDir`); then `<configDir>/wiki`. The writer does not inject
 * `wiki.path` into a newly generated defaults file — the last step is
 * the implicit default. This function never creates the directory.
 */
export function resolveVault(repoRoot: string, env: NodeJS.ProcessEnv, options: ResolveVaultOptions = {}): ResolveVaultResult {
  const home = options.home ?? homedir();
  const { configDir, slug } = configPaths(repoRoot, env, { ...options, home });
  const fromEnv = trimmed(env.NERDWAY_WIKI) ?? trimmed(env.NERDBRAIN_VAULT);
  if (fromEnv !== undefined) {
    const path = absoluteWikiPath(fromEnv, home, options.cwd ?? process.cwd());
    return { status: "ok", path, source: "env", exists: existsSync(path) };
  }

  const project = slug.length === 0 ? { kind: "missing" as const } : readYamlFile(join(configDir, slug, "config.yml"));
  const fromProject = wikiPathFromYaml(project, slug.length === 0 ? "project config" : `${slug}/config.yml`);
  if (fromProject.kind === "invalid") return { status: "invalid", errors: fromProject.errors };
  if (fromProject.kind === "ok") {
    const path = absoluteWikiPath(fromProject.path, home, configDir);
    return { status: "ok", path, source: "project", exists: existsSync(path) };
  }

  const defaults = readYamlFile(join(configDir, "config.yml"));
  const fromDefaults = wikiPathFromYaml(defaults, "config.yml");
  if (fromDefaults.kind === "invalid") return { status: "invalid", errors: fromDefaults.errors };
  if (fromDefaults.kind === "ok") {
    const path = absoluteWikiPath(fromDefaults.path, home, configDir);
    return { status: "ok", path, source: "defaults", exists: existsSync(path) };
  }

  const path = join(configDir, "wiki");
  return { status: "ok", path, source: "default", exists: existsSync(path) };
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

function canonical(value: unknown): string {
  if (typeof value !== "object" || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function sameConfig(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return canonical(left) === canonical(right);
}

function fingerprintOf(value: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function recordedFingerprint(path: string): string | null {
  const text = readText(path);
  if (text === null) return null;
  const hash = text.trim().toLowerCase();
  return FINGERPRINT.test(hash) ? hash : null;
}

function writeResolvedFingerprint(path: string, value: Record<string, unknown>): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const hash = fingerprintOf(value);
    writeFileSync(path, `${hash}\n`);
    return recordedFingerprint(path) === hash;
  } catch {
    return false;
  }
}

export function migrationNotice(result: MigrationResult): string {
  switch (result.status) {
    case "migrated":
      return `nerdway: copied ## Platform from CLAUDE.md to ${result.path}. CLAUDE.md was not changed; the section is no longer read and you can remove it.`;
    case "stale":
      return `nerdway: ## Platform in CLAUDE.md matches ${result.path} and is no longer read; you can remove it.`;
    case "stale-differs":
      return `nerdway: ## Platform in CLAUDE.md differs from ${result.path} and is ignored (resolved earlier); you can remove it.`;
    case "unchanged":
    case "conflict":
      return "";
  }
}

function writeProjectAndReadBack(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: MigratePlatformOptions,
  toWrite: Record<string, unknown>,
  projectExists: boolean,
): MigrationResult | { status: "ok"; path: string } {
  const written = writePlatformConfig(repoRoot, env, toWrite, options);
  if (written.status !== "ok") return { status: "conflict", errors: written.errors };
  const readBack = readYamlFile(written.path);
  if (readBack.kind !== "ok" || !sameConfig(readBack.value, toWrite)) {
    if (!projectExists) {
      try {
        unlinkSync(written.path);
      } catch {
        return { status: "conflict", errors: ["wrote the project config but the read-back did not match"] };
      }
    }
    return { status: "conflict", errors: ["wrote the project config but the read-back did not match"] };
  }
  return { status: "ok", path: written.path };
}

function leftoverStatus(user: Record<string, unknown>, legacy: Record<string, unknown>): "stale" | "stale-differs" {
  return sameConfig(user, legacy) ? "stale" : "stale-differs";
}

export function migrateLegacyPlatform(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: MigratePlatformOptions,
): MigrationResult {
  const claudeMd = join(repoRoot, "CLAUDE.md");
  const markdown = isFile(claudeMd) ? readFileSync(claudeMd, "utf8") : undefined;
  const legacy = readPlatform(markdown, options.vocabulary, options.trackerAdapters);
  if (legacy.status === "absent") return { status: "unchanged" };

  const { configDir, slug } = configPaths(repoRoot, env, options);
  if (slug.length === 0) {
    return { status: "conflict", errors: ["ambiguous project slug - cannot choose a project config path"] };
  }
  if (legacy.status !== "found") {
    return { status: "conflict", errors: legacy.errors.length > 0 ? legacy.errors : ["legacy ## Platform section is unreadable"] };
  }

  const projectPath = join(configDir, slug, "config.yml");
  const sidecar = join(configDir, slug, RESOLVED_SIDECAR);
  const existing = readYamlFile(projectPath);
  if (existing.kind === "invalid") {
    return { status: "conflict", errors: existing.errors.map((error) => `${slug}/config.yml: ${error}`) };
  }

  const projectExists = existing.kind === "ok";
  if (projectExists && sameConfig(existing.value, legacy.value)) {
    return { status: "stale", path: projectPath };
  }

  if (options.resolve === undefined) {
    if (projectExists && recordedFingerprint(sidecar) === fingerprintOf(legacy.value)) {
      return { status: "stale-differs", path: projectPath };
    }
    if (projectExists) {
      return {
        status: "conflict",
        errors: [
          "legacy ## Platform section differs from the user project config",
          "ask the user: keep the user config, take the repo values, or merge",
          "then run: node scripts/validate-platform-config.ts --resolve keep-user|take-repo|merge <repo>",
        ],
      };
    }
  }

  let toWrite: Record<string, unknown> | null = null;
  if (options.resolve === "keep-user") {
    if (!projectExists) return { status: "conflict", errors: ["keep-user needs an existing project config"] };
  } else if (options.resolve === "merge") {
    toWrite = mergePlatformConfigs(legacy.value, projectExists ? existing.value : {});
  } else if (options.resolve === "take-repo" || !projectExists) {
    toWrite = legacy.value;
  }

  if (toWrite !== null) {
    const written = writeProjectAndReadBack(repoRoot, env, options, toWrite, projectExists);
    if (written.status !== "ok") return written;
  }

  if (!projectExists && options.resolve === undefined) {
    return { status: "migrated", path: projectPath };
  }

  if (!writeResolvedFingerprint(sidecar, legacy.value)) {
    return { status: "conflict", errors: ["could not record the resolution fingerprint"] };
  }

  const after = readYamlFile(projectPath);
  const user = after.kind === "ok" ? after.value : projectExists ? existing.value : legacy.value;
  return { status: leftoverStatus(user, legacy.value), path: projectPath };
}
