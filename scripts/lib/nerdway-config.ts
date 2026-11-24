import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import { readPlatform, type PlatformRead, type PlatformVocabulary } from "../types/platform-config.ts";

import type { HostId } from "./host-detect.ts";
import {
  configPaths,
  hasProjectConfigPath,
  projectConfigLabel,
  projectConfigLocation,
  userProjectConfigPath,
  REPO_CONFIG_FILE,
  resolveConfigDir,
  resolveSlug,
  trimmed,
  type ConfigLocationOptions,
  type ResolveSlugOptions,
} from "./config-location.ts";
import {
  applySectionPatch,
  extractSection,
  getSection,
  hasSection,
  inspectConfig,
  readSection,
  unknownSectionNotices,
  writeSection,
} from "./config-sections.ts";
import { parseConfig, patchSections } from "./yaml.ts";
import { detectMachine, type MachineKind } from "./workstation.ts";

export { resolveConfigDir, resolveSlug, type ConfigLocationOptions, type ResolveSlugOptions };

export interface ReadPlatformOptions extends ConfigLocationOptions {
  vocabulary: PlatformVocabulary;
  trackerAdapters: ReadonlyMap<string, string>;
}

export type VaultSource = "env" | "project" | "defaults" | "default";

export interface ResolveVaultOptions extends ConfigLocationOptions {
  cwd?: string;
  host?: HostId;
}

export type LiveReason = "workstation" | "remote" | "missing";

export type ResolveVaultResult =
  | {
      status: "ok";
      path: string;
      source: VaultSource;
      exists: boolean;
      live: boolean;
      machine: MachineKind;
      reason: LiveReason;
    }
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

function sectionContext(value: Record<string, unknown>, options: ReadPlatformOptions) {
  return { vocabulary: options.vocabulary, trackerAdapter: options.trackerAdapters.get(String(value.tracker)) };
}

function platformErrors(value: Record<string, unknown>, options: ReadPlatformOptions): string[] {
  return inspectConfig(value, sectionContext(value, options)).errors;
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

export function mergePlatformConfigs(
  defaults: Record<string, unknown>,
  project: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaults, ...project };
}

type YamlFile =
  | { kind: "missing" }
  | { kind: "ok"; value: Record<string, unknown>; text: string }
  | { kind: "invalid"; errors: string[] };

function readYamlFile(path: string): YamlFile {
  if (!isFile(path)) return { kind: "missing" };
  const text = readFileSync(path, "utf8");
  const parsed = parseConfig(text);
  if (parsed.value === undefined) return { kind: "invalid", errors: parsed.errors };
  return { kind: "ok", value: parsed.value, text };
}

export function readPlatformConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: ReadPlatformOptions,
): PlatformRead {
  const migrated = migrateLegacyPlatform(repoRoot, env, options);
  if (migrated.status === "conflict") return { status: "migration-needed", errors: migrated.errors };

  const location = projectConfigLocation(repoRoot, env, options);
  const label = projectConfigLabel(location);
  const defaults = readYamlFile(join(location.configDir, "config.yml"));
  const project = hasProjectConfigPath(location) ? readYamlFile(location.path) : { kind: "missing" as const };
  if (defaults.kind === "invalid") return { status: "invalid", errors: defaults.errors.map((error) => `config.yml: ${error}`) };
  if (project.kind === "invalid") return { status: "invalid", errors: project.errors.map((error) => `${label}: ${error}`) };
  const defaultsValue = defaults.kind === "ok" ? defaults.value : {};
  const projectValue = project.kind === "ok" ? project.value : {};
  const notices = [
    ...unknownSectionNotices(defaultsValue, "config.yml"),
    ...unknownSectionNotices(projectValue, label),
  ];
  const value = mergePlatformConfigs(defaultsValue, projectValue);
  const mapErrors = inspectConfig(value, sectionContext(value, options)).errors.filter((error) => error === "extensions must be a map");
  if (mapErrors.length > 0) return { status: "invalid", errors: mapErrors, notices };
  if (!hasSection("platform", defaultsValue) && !hasSection("platform", projectValue)) {
    return { status: "absent", errors: ["no platform config"], notices };
  }
  const errors = platformErrors(value, options);
  if (errors.length > 0) return { status: "invalid", errors, notices };
  return { status: "found", value, errors: [], notices };
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

function wikiPathFromSection(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  options: ResolveVaultOptions,
  layer: "defaults" | "project",
): { kind: "missing" } | { kind: "ok"; path: string } | { kind: "invalid"; errors: string[] } {
  const read = readSection("wiki", { repoRoot, env, layer, ...options });
  if (read.status === "invalid") return { kind: "invalid", errors: read.errors };
  if (read.status !== "found" || typeof read.value !== "object" || read.value === null || Array.isArray(read.value)) {
    return { kind: "missing" };
  }
  const path = (read.value as Record<string, unknown>).path;
  if (typeof path !== "string") return { kind: "missing" };
  return { kind: "ok", path };
}

/**
 * Resolve the wiki directory: the full path of the directory that holds the
 * wiki content itself (guides/, entities/, index.md, log.md).
 *
 * Order: env `NERDWAY_WIKI`, then legacy env `NERDBRAIN_VAULT`; then
 * `wiki.path` in the project file at its location, then in
 * `<configDir>/config.yml` (`~` expanded; a relative path resolves against
 * the repository root when the project file is repo-located, else against
 * `configDir`); then `<configDir>/wiki`. The writer does not inject
 * `wiki.path` into a newly generated defaults file — the last step is
 * the implicit default. This function never creates the directory.
 *
 * `live` is true when the directory exists and this session runs on a user
 * workstation (`detectMachine`), whatever the directory is: a plain folder or
 * an Obsidian vault. A directory on a remote agent machine is never live.
 */
export function resolveVault(repoRoot: string, env: NodeJS.ProcessEnv, options: ResolveVaultOptions = {}): ResolveVaultResult {
  const home = options.home ?? homedir();
  const { configDir } = configPaths(repoRoot, env, { ...options, home });
  const machine = detectMachine({ env, host: options.host }).kind;
  const located = (path: string, source: VaultSource): ResolveVaultResult => {
    const exists = existsSync(path);
    const reason: LiveReason = !exists ? "missing" : machine === "workstation" ? "workstation" : "remote";
    return { status: "ok", path, source, exists, live: reason === "workstation", machine, reason };
  };
  const fromEnv = trimmed(env.NERDWAY_WIKI) ?? trimmed(env.NERDBRAIN_VAULT);
  if (fromEnv !== undefined) return located(absoluteWikiPath(fromEnv, home, options.cwd ?? process.cwd()), "env");

  const fromProject = wikiPathFromSection(repoRoot, env, { ...options, home }, "project");
  if (fromProject.kind === "invalid") return { status: "invalid", errors: fromProject.errors };
  if (fromProject.kind === "ok") {
    const projectBase = projectConfigLocation(repoRoot, env, { ...options, home }).strategy === "repo" ? repoRoot : configDir;
    return located(absoluteWikiPath(fromProject.path, home, projectBase), "project");
  }

  const fromDefaults = wikiPathFromSection(repoRoot, env, { ...options, home }, "defaults");
  if (fromDefaults.kind === "invalid") return { status: "invalid", errors: fromDefaults.errors };
  if (fromDefaults.kind === "ok") return located(absoluteWikiPath(fromDefaults.path, home, configDir), "defaults");

  return located(join(configDir, "wiki"), "default");
}

export function writePlatformConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  input: Record<string, unknown>,
  options: WritePlatformOptions,
): WritePlatformResult {
  const io = {
    repoRoot,
    env,
    vocabulary: options.vocabulary,
    trackerAdapters: options.trackerAdapters,
    platform: options.platform,
    home: options.home,
    aliasesPath: options.aliasesPath,
    gitRemote: options.gitRemote,
    target: (options.defaults ? "defaults" : "project") as "defaults" | "project",
  };
  if (options.keys === undefined) {
    const section = getSection("platform");
    const owned: Record<string, unknown> = {};
    if (section?.scope === "core") {
      for (const key of section.keys) {
        if (Object.hasOwn(input, key)) owned[key] = input[key];
      }
    }
    return writeSection("platform", owned, io);
  }

  const location = projectConfigLocation(repoRoot, env, options);
  const { configDir } = location;
  const defaultsPath = join(configDir, "config.yml");
  const projectPath = location.path;
  const defaults = readYamlFile(defaultsPath);
  const existing = hasProjectConfigPath(location) ? readYamlFile(projectPath) : ({ kind: "missing" } as const);
  if (defaults.kind === "invalid") return { status: "invalid", errors: defaults.errors.map((error) => `config.yml: ${error}`) };
  if (existing.kind === "invalid") return { status: "invalid", errors: existing.errors.map((error) => `${projectConfigLabel(location)}: ${error}`) };
  const plan = keyedPlan(input, options.keys);
  if (options.defaults) {
    const existingDefaults = defaults.kind === "ok" ? defaults.value : {};
    const nextDefaults = applySectionPatch(existingDefaults, plan.set, plan.remove);
    const project = existing.kind === "ok" ? existing.value : {};
    const merged = mergePlatformConfigs(nextDefaults, project);
    const errors = platformErrors(existing.kind === "ok" || Object.keys(project).length > 0 ? merged : nextDefaults, options);
    if (errors.length > 0) return { status: "invalid", errors };
    mkdirSync(configDir, { recursive: true });
    const text = defaults.kind === "ok" ? defaults.text : "";
    writeFileSync(defaultsPath, patchSections(text, plan.set, plan.remove));
    return { status: "ok", path: defaultsPath };
  }
  if (!hasProjectConfigPath(location)) return { status: "invalid", errors: ["project slug is empty"] };
  const current = existing.kind === "ok" ? existing.value : {};
  const nextProject = applySectionPatch(current, plan.set, plan.remove);
  const merged = mergePlatformConfigs(defaults.kind === "ok" ? defaults.value : {}, nextProject);
  const errors = platformErrors(merged, options);
  if (errors.length > 0) return { status: "invalid", errors };
  mkdirSync(dirname(projectPath), { recursive: true });
  const text = existing.kind === "ok" ? existing.text : "";
  writeFileSync(projectPath, patchSections(text, plan.set, plan.remove));
  return { status: "ok", path: projectPath };
}

/** The first line of a repo-located config created before any key is set. */
export const REPO_CONFIG_HEADER = "# nerdway project config (no secrets: this file is read by anyone with the repository)\n";

export type MoveProjectConfigResult =
  | { status: "moved"; from: string; to: string }
  | { status: "created"; path: string }
  | { status: "unchanged"; path: string }
  | { status: "refused"; errors: string[] };

/**
 * Switch a project's config between the `user` and `repo` locations by
 * moving the one file, so no second copy is left to read. With no config
 * yet, choosing `repo` creates an empty repo-located file (its presence
 * records the strategy) and choosing `user` changes nothing. Never
 * overwrites: a target that already exists, an unreadable source, or an
 * empty slug refuses the move.
 */
export function moveProjectConfig(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  to: "user" | "repo",
  options: ConfigLocationOptions = {},
): MoveProjectConfigResult {
  const location = projectConfigLocation(repoRoot, env, options);
  if (!hasProjectConfigPath(location)) return { status: "refused", errors: ["project slug is empty"] };
  if (location.strategy === to) return { status: "unchanged", path: location.path };
  if (!isFile(location.path)) {
    const created = join(repoRoot, REPO_CONFIG_FILE);
    mkdirSync(dirname(created), { recursive: true });
    writeFileSync(created, REPO_CONFIG_HEADER);
    return { status: "created", path: created };
  }
  const target = to === "repo" ? join(repoRoot, REPO_CONFIG_FILE) : userProjectConfigPath(location.configDir, location.slug);
  if (to === "user" && location.slug.length === 0) return { status: "refused", errors: ["project slug is empty"] };
  if (existsSync(target)) return { status: "refused", errors: [`${target} already exists; merge or remove it first`] };
  const source = readYamlFile(location.path);
  if (source.kind !== "ok") {
    const errors = source.kind === "invalid" ? source.errors : ["unreadable"];
    return { status: "refused", errors: errors.map((error) => `${projectConfigLabel(location)}: ${error}`) };
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source.text);
  if (readFileSync(target, "utf8") !== source.text) {
    unlinkSync(target);
    return { status: "refused", errors: ["the copy did not read back the same; nothing moved"] };
  }
  unlinkSync(location.path);
  return { status: "moved", from: location.path, to: target };
}

function keyedPlan(input: Record<string, unknown>, keys: string[]): { set: Record<string, unknown>; remove: string[] } {
  const set: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.hasOwn(input, key)) set[key] = input[key];
  }
  return { set, remove: [] };
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
  if (readBack.kind !== "ok" || !sameConfig(extractSection("platform", readBack.value), extractSection("platform", toWrite))) {
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

  const location = projectConfigLocation(repoRoot, env, options);
  if (location.strategy === "repo") return { status: "unchanged" };
  const { configDir, slug } = location;
  if (slug.length === 0) {
    return { status: "conflict", errors: ["ambiguous project slug - cannot choose a project config path"] };
  }
  if (legacy.status !== "found") {
    return { status: "conflict", errors: legacy.errors.length > 0 ? legacy.errors : ["legacy ## Platform section is unreadable"] };
  }

  const projectPath = userProjectConfigPath(configDir, slug);
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
