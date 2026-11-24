import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The nerdway-setup check registry: the contract every check obeys, the
// validator that enforces it, and the merge rule that keeps core ids safe.
// The checks themselves are data in skills/nerdway-setup/checks.json; no
// code here names an individual check.

export const CONTRACT_VERSION = 1;

/** Probes the state builder implements. A check names one; a new check that reuses a probe is data only. */
export const PROBE_IDS = [
  "wiki-dir",
  "defaults-file",
  "machine-kind",
  "cli-path",
  "git-top-level",
  "project-file",
  "platform-read",
  "status-map",
  "tracker-board",
] as const;
export type ProbeId = (typeof PROBE_IDS)[number];

export const AREAS = ["machine", "global", "project", "platform", "statuses", "wiki"] as const;
export type Area = (typeof AREAS)[number];

export type Scope = "global" | "project";

/** Config keys nerdway-setup may edit itself. Everything else is handed off. */
export const OWNED_KEYS = ["wiki.path"] as const;

export type Fix =
  | { kind: "config-key"; key: (typeof OWNED_KEYS)[number]; layer: "defaults" | "project" }
  | { kind: "location-strategy" }
  | { kind: "env-hint"; variable: string };

export interface SetupCheck {
  id: string;
  title: string;
  area: Area;
  scope: Scope;
  probe: ProbeId;
  /** Part of the quick preflight other skills run before they start. */
  preflight: boolean;
  explain: string;
  handoff?: string;
  fix?: Fix;
}

export interface RegistryResult {
  checks: SetupCheck[];
  errors: string[];
}

export interface RegistryContext {
  /** Skill directory names a `handoff` may point at. */
  skills: ReadonlySet<string>;
}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ENV_VARIABLE = /^[A-Z][A-Z0-9_]*$/;
const CHECK_KEYS = new Set(["id", "title", "area", "scope", "probe", "preflight", "explain", "handoff", "fix"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function fixErrors(fix: unknown, where: string): string[] {
  if (!isRecord(fix)) return [`${where}: fix must be a map`];
  if (fix.kind === "config-key") {
    const errors: string[] = [];
    if (!(OWNED_KEYS as readonly unknown[]).includes(fix.key)) {
      errors.push(`${where}: fix.key ${JSON.stringify(fix.key)} is not a key nerdway-setup owns (${OWNED_KEYS.join(", ")}); hand it off instead`);
    }
    if (fix.layer !== "defaults" && fix.layer !== "project") errors.push(`${where}: fix.layer must be defaults or project`);
    return errors;
  }
  if (fix.kind === "location-strategy") return [];
  if (fix.kind === "env-hint") return ENV_VARIABLE.test(String(fix.variable)) ? [] : [`${where}: fix.variable must be an environment variable name`];
  return [`${where}: fix.kind must be config-key, location-strategy or env-hint`];
}

/** Errors for one check entry, without the cross-entry id rule. */
export function checkErrors(entry: unknown, index: number, context: RegistryContext): string[] {
  const where = `checks[${index}]`;
  if (!isRecord(entry)) return [`${where}: must be a map`];
  const named = typeof entry.id === "string" ? `${where} (${entry.id})` : where;
  const errors: string[] = [];
  for (const key of Object.keys(entry)) if (!CHECK_KEYS.has(key)) errors.push(`${named}: unknown key ${key}`);
  if (typeof entry.id !== "string" || !ID.test(entry.id)) errors.push(`${named}: id must be kebab-case`);
  if (!nonEmpty(entry.title)) errors.push(`${named}: title must be a non-empty string`);
  if (!nonEmpty(entry.explain)) errors.push(`${named}: explain must be a non-empty string`);
  if (!(AREAS as readonly unknown[]).includes(entry.area)) errors.push(`${named}: area must be one of ${AREAS.join(", ")}`);
  if (entry.scope !== "global" && entry.scope !== "project") errors.push(`${named}: scope must be global or project`);
  if (!(PROBE_IDS as readonly unknown[]).includes(entry.probe)) errors.push(`${named}: probe must be one of ${PROBE_IDS.join(", ")}`);
  if (typeof entry.preflight !== "boolean") errors.push(`${named}: preflight must be true or false`);
  const hasHandoff = entry.handoff !== undefined;
  const hasFix = entry.fix !== undefined;
  if (hasHandoff === hasFix) errors.push(`${named}: exactly one of handoff or fix is required`);
  if (hasHandoff && (typeof entry.handoff !== "string" || !context.skills.has(entry.handoff))) {
    errors.push(`${named}: handoff ${JSON.stringify(entry.handoff)} does not name a skill`);
  }
  if (hasFix) errors.push(...fixErrors(entry.fix, named));
  return errors;
}

/** Validate a whole registry file: the contract version, every entry, and unique ids. */
export function validateRegistry(value: unknown, context: RegistryContext): RegistryResult {
  if (!isRecord(value)) return { checks: [], errors: ["registry must be a map"] };
  const errors: string[] = [];
  if (value.contract !== CONTRACT_VERSION) errors.push(`contract must be ${CONTRACT_VERSION}`);
  if (!Array.isArray(value.checks)) return { checks: [], errors: [...errors, "checks must be a list"] };
  const seen = new Set<string>();
  value.checks.forEach((entry, index) => {
    errors.push(...checkErrors(entry, index, context));
    const id = isRecord(entry) ? entry.id : undefined;
    if (typeof id === "string") {
      if (seen.has(id)) errors.push(`checks[${index}] (${id}): duplicate id`);
      seen.add(id);
    }
  });
  return { checks: errors.length === 0 ? (value.checks as SetupCheck[]) : [], errors };
}

export interface MergeResult {
  checks: SetupCheck[];
  rejected: { id: string; reason: string }[];
}

/**
 * Add further checks after the core ones. An id already taken — by a core
 * check or an earlier addition — is rejected and never overrides; an entry
 * that breaks the contract is rejected too. Core checks always come first,
 * in their own order.
 */
export function mergeChecks(core: readonly SetupCheck[], extra: readonly unknown[], context: RegistryContext): MergeResult {
  const checks = [...core];
  const taken = new Set(core.map((check) => check.id));
  const rejected: MergeResult["rejected"] = [];
  extra.forEach((entry, index) => {
    const id = isRecord(entry) && typeof entry.id === "string" ? entry.id : `#${index}`;
    if (taken.has(id)) {
      rejected.push({ id, reason: `id ${id} is already registered; a check never overrides another` });
      return;
    }
    const errors = checkErrors(entry, index, context);
    if (errors.length > 0) {
      rejected.push({ id, reason: errors.join("; ") });
      return;
    }
    taken.add(id);
    checks.push(entry as SetupCheck);
  });
  return { checks, rejected };
}

/** The one check with this id, or undefined. Ids are unique, so there is never more than one. */
export function checkById(checks: readonly SetupCheck[], id: string): SetupCheck | undefined {
  return checks.find((check) => check.id === id);
}

export const CORE_CHECKS_FILE = join("skills", "nerdway-setup", "checks.json");

/** Skill directory names under `<root>/skills`. */
export function skillNames(root: string): Set<string> {
  const dir = join(root, "skills");
  return new Set(readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory()));
}

/** Read and validate the core registry shipped with the plugin at `root`. */
export function loadCoreChecks(root: string): RegistryResult {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(root, CORE_CHECKS_FILE), "utf8"));
  } catch (error) {
    return { checks: [], errors: [`${CORE_CHECKS_FILE}: ${(error as Error).message}`] };
  }
  const result = validateRegistry(value, { skills: skillNames(root) });
  return { checks: result.checks, errors: result.errors.map((error) => `${CORE_CHECKS_FILE}: ${error}`) };
}
