import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { PlatformRead } from "../types/platform-config.ts";

import { hasProjectConfigPath, projectConfigLocation, type ProjectConfigLocation } from "./config-location.ts";
import { resolveVault, type ResolveVaultResult } from "./nerdway-config.ts";
import { readPlatformFile } from "./platform-read.ts";
import type { ProbeId, SetupCheck } from "./setup-checks.ts";
import { detectMachine } from "./workstation.ts";
import { parseConfig } from "./yaml.ts";

// Reads the state of a machine and a project for nerdway-setup. Every probe
// only reads: tracker, VCS and board state stay with the skills that own
// them. A check names a probe; nothing here names a check.

export type ProbeStatus = "ok" | "warn" | "missing" | "unknown";

export interface ProbeResult {
  status: ProbeStatus;
  findings: string[];
  /** A concrete value the fix could write, when the probe found one. */
  suggestion?: string;
}

export interface SetupContext {
  /** The git top level, or the directory itself outside a repository. */
  repoRoot: string;
  inRepo: boolean;
  env: NodeJS.ProcessEnv;
  home: string;
  pluginRoot: string;
  location: ProjectConfigLocation;
  vault: () => ResolveVaultResult;
  platform: () => PlatformRead;
  /** True when `command args…` runs and exits 0. */
  runs: (command: string, args: string[]) => boolean;
}

export type Probe = (context: SetupContext) => ProbeResult;

const WIKI_MARKERS = ["index.md", "log.md", "entities"];

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeWiki(path: string): boolean {
  return WIKI_MARKERS.some((marker) => existsSync(join(path, marker)));
}

function wikiChild(path: string): string | undefined {
  try {
    return readdirSync(path)
      .map((name) => join(path, name))
      .find((child) => isDir(child) && looksLikeWiki(child));
  } catch {
    return undefined;
  }
}

function wikiRoot(context: SetupContext): ProbeResult {
  const vault = context.vault();
  if (vault.status !== "ok") return { status: "warn", findings: vault.errors };
  const where = `wiki directory ${vault.path} (from ${vault.source})`;
  const override = vault.source === "env" ? ["NERDWAY_WIKI or NERDBRAIN_VAULT sets this path and overrides the config file until it is changed or unset"] : [];
  if (!vault.exists) {
    if (vault.machine !== "workstation") return { status: "warn", findings: [`${where} is not on this machine; wiki writes are queued for a workstation`] };
    return { status: "missing", findings: [`${where} does not exist yet`] };
  }
  if (looksLikeWiki(vault.path)) return { status: "ok", findings: [where] };
  const child = wikiChild(vault.path);
  if (child !== undefined) {
    return { status: "warn", findings: [`${where} holds no wiki pages, but ${child} does: the path points one level too high`, ...override], suggestion: child };
  }
  const parent = dirname(vault.path);
  if (parent !== vault.path && looksLikeWiki(parent)) {
    return { status: "warn", findings: [`${where} sits inside the wiki at ${parent}: the path points one level too deep`, ...override], suggestion: parent };
  }
  return { status: "warn", findings: [`${where} holds no wiki pages yet (no index.md, log.md or entities/)`] };
}

function yamlState(path: string, label: string): ProbeResult {
  if (!existsSync(path)) return { status: "missing", findings: [`no ${label} at ${path}`] };
  const parsed = parseConfig(readFileSync(path, "utf8"));
  if (parsed.value === undefined) return { status: "warn", findings: parsed.errors.map((error) => `${path}: ${error}`) };
  return { status: "ok", findings: [path] };
}

function globalConfig(context: SetupContext): ProbeResult {
  const state = yamlState(join(context.location.configDir, "config.yml"), "global config");
  if (state.status !== "missing") return state;
  return { status: "warn", findings: [...state.findings, "optional: built-in defaults apply"] };
}

function machine(context: SetupContext): ProbeResult {
  const result = detectMachine({ env: context.env });
  return { status: "ok", findings: [`${result.kind} (${result.reason})`] };
}

/** CLIs per tracker or VCS value; git and node are always needed. */
const PLATFORM_CLIS: Record<string, string> = {
  linear: "linearis",
  github: "gh",
  gitlab: "glab",
  jira: "acli",
  ado: "az",
};

function clis(context: SetupContext): ProbeResult {
  const read = context.platform();
  const wanted = new Set(["git", "node"]);
  if (read.status === "found") {
    for (const key of ["tracker", "vcs"]) {
      const cli = PLATFORM_CLIS[String(read.value[key])];
      if (cli !== undefined) wanted.add(cli);
    }
  }
  const missing = [...wanted].filter((cli) => !context.runs(cli, ["--version"]));
  if (missing.length > 0) return { status: "missing", findings: [`not found on PATH: ${missing.join(", ")}`] };
  return { status: "ok", findings: [`found: ${[...wanted].join(", ")}`] };
}

function gitRepo(context: SetupContext): ProbeResult {
  if (context.inRepo) return { status: "ok", findings: [context.repoRoot] };
  return { status: "missing", findings: [`${context.repoRoot} is not inside a git repository`] };
}

function projectConfig(context: SetupContext): ProbeResult {
  const { location } = context;
  if (!context.inRepo || !hasProjectConfigPath(location)) return { status: "missing", findings: ["no project to configure here"] };
  const state = yamlState(location.path, "project config");
  return { ...state, findings: [`strategy ${location.strategy}`, ...state.findings] };
}

function platformConfig(context: SetupContext): ProbeResult {
  if (!context.inRepo) return { status: "missing", findings: ["no project to configure here"] };
  const read = context.platform();
  if (read.status === "found") return { status: "ok", findings: [`tracker ${String(read.value.tracker)}, vcs ${String(read.value.vcs)}`] };
  if (read.status === "absent") return { status: "missing", findings: ["no tracker or VCS recorded"] };
  return { status: "warn", findings: read.errors };
}

function statusesBound(context: SetupContext): ProbeResult {
  if (!context.inRepo) return { status: "missing", findings: ["no project to configure here"] };
  const read = context.platform();
  if (read.status !== "found") return { status: "missing", findings: ["needs the platform first"] };
  if (read.value.statuses !== undefined) return { status: "ok", findings: ["explicit statuses binding"] };
  return { status: "ok", findings: ["no explicit binding; the tracker adapter default applies"] };
}

function board(context: SetupContext): ProbeResult {
  if (!context.inRepo || context.platform().status !== "found") return { status: "missing", findings: ["needs the platform first"] };
  return { status: "unknown", findings: ["needs the tracker; board-setup reads it"] };
}

export const PROBES: Record<ProbeId, Probe> = {
  "wiki-root": wikiRoot,
  "global-config": globalConfig,
  machine,
  clis,
  "git-repo": gitRepo,
  "project-config": projectConfig,
  "platform-config": platformConfig,
  "statuses-bound": statusesBound,
  board,
};

function memo<T>(read: () => T): () => T {
  let value: { set: false } | { set: true; value: T } = { set: false };
  return () => {
    if (!value.set) value = { set: true, value: read() };
    return value.value;
  };
}

function gitTopLevel(dir: string): string | undefined {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function commandRuns(command: string, args: string[]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore", timeout: 10_000, shell: process.platform === "win32" });
  return result.status === 0;
}

export interface ContextOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  runs?: SetupContext["runs"];
}

export function setupContext(dir: string, pluginRoot: string, options: ContextOptions = {}): SetupContext {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const top = gitTopLevel(dir);
  const repoRoot = top ?? dir;
  return {
    repoRoot,
    inRepo: top !== undefined,
    env,
    home,
    pluginRoot,
    location: projectConfigLocation(repoRoot, env, { home }),
    vault: memo(() => resolveVault(repoRoot, env, { home })),
    platform: memo(() => readPlatformFile(pluginRoot, repoRoot, env)),
    runs: options.runs ?? commandRuns,
  };
}

export interface CheckState extends SetupCheck, ProbeResult {}

export interface SetupState {
  repoRoot: string;
  inRepo: boolean;
  configDir: string;
  globalConfig: { path: string; exists: boolean };
  projectConfig: { strategy: ProjectConfigLocation["strategy"]; path: string; exists: boolean };
  checks: CheckState[];
}

export function buildSetupState(context: SetupContext, checks: readonly SetupCheck[], probes: Record<ProbeId, Probe> = PROBES): SetupState {
  const { location } = context;
  const globalPath = join(location.configDir, "config.yml");
  return {
    repoRoot: context.repoRoot,
    inRepo: context.inRepo,
    configDir: location.configDir,
    globalConfig: { path: globalPath, exists: existsSync(globalPath) },
    projectConfig: {
      strategy: location.strategy,
      path: location.path,
      exists: context.inRepo && hasProjectConfigPath(location) && existsSync(location.path),
    },
    checks: checks.map((check) => ({ ...check, ...probes[check.probe](context) })),
  };
}

export type PreflightStatus = "ready" | "incomplete" | "undetermined";

export interface Preflight {
  caller: string;
  status: PreflightStatus;
  inRepo: boolean;
  repoRoot: string;
  projectConfig: SetupState["projectConfig"];
  /** Preflight checks that are missing: the caller should not start before they are handed off or fixed. */
  blocking: CheckState[];
  /** Preflight checks that need a look but do not block. */
  warnings: CheckState[];
}

/** The quick pass other skills run first: only the checks marked `preflight`. */
export function preflightSummary(state: SetupState, caller: string): Preflight {
  const preflight = state.checks.filter((check) => check.preflight);
  const blocking = preflight.filter((check) => check.status === "missing");
  const warnings = preflight.filter((check) => check.status === "warn");
  const status: PreflightStatus = !state.inRepo ? "undetermined" : blocking.length > 0 ? "incomplete" : "ready";
  return { caller, status, inRepo: state.inRepo, repoRoot: state.repoRoot, projectConfig: state.projectConfig, blocking, warnings };
}
