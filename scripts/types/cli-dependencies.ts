export const PLATFORM_KEYS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export interface InstallStrategy {
  download: string;
  binary: string;
  _comment?: string;
}

export interface CliEntry {
  id: string;
  minVersion: string;
  versionCommand: string[];
  versionRegex: string;
  requiredBy: string[];
  releaseBase?: string;
  checksums?: string;
  manualInstall?: string;
  npm?: string;
  install?: Partial<Record<PlatformKey, InstallStrategy>>;
  auth?: { check: string[]; instructions: string };
}

export interface CliContract {
  clis: CliEntry[];
}

export type CliSubsetFilter =
  | { mode: "all" }
  | { mode: "skills"; names: readonly string[] }
  | { mode: "only"; ids: readonly string[] };

export type BootstrapArgs =
  | { ok: true; check: boolean; filter: CliSubsetFilter }
  | { ok: false; errors: string[] };

function splitFlag(arg: string): [string, string | undefined] {
  const at = arg.indexOf("=");
  return arg.startsWith("--") && at !== -1 ? [arg.slice(0, at), arg.slice(at + 1)] : [arg, undefined];
}

function takeList(inline: string | undefined, argv: readonly string[], index: number): { values: string[]; next: number } | { error: string } {
  const raw = inline ?? argv[index];
  if (raw === undefined || raw.startsWith("-")) return { error: "needs a value" };
  const values = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  if (values.length === 0) return { error: "needs a value" };
  return { values, next: inline === undefined ? index + 1 : index };
}

export function parseBootstrapArgs(argv: readonly string[]): BootstrapArgs {
  let check = false;
  let all = false;
  const only: string[] = [];
  const skills: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--check") {
      check = true;
      continue;
    }
    if (flag === "--all") {
      all = true;
      continue;
    }
    if (flag === "--only") {
      const taken = takeList(inline, argv, i + 1);
      if ("error" in taken) return { ok: false, errors: [`--only ${taken.error}`] };
      only.push(...taken.values);
      i = taken.next - 1;
      continue;
    }
    if (flag === "--skills") {
      const taken = takeList(inline, argv, i + 1);
      if ("error" in taken) return { ok: false, errors: [`--skills ${taken.error}`] };
      skills.push(...taken.values);
      i = taken.next - 1;
      continue;
    }
  }

  if (all && (only.length > 0 || skills.length > 0)) {
    return { ok: false, errors: ["--all cannot be combined with --only or --skills"] };
  }
  if (only.length > 0 && skills.length > 0) {
    return { ok: false, errors: ["--only cannot be combined with --skills"] };
  }
  if (only.length > 0) return { ok: true, check, filter: { mode: "only", ids: only } };
  if (skills.length > 0) return { ok: true, check, filter: { mode: "skills", names: skills } };
  return { ok: true, check, filter: { mode: "all" } };
}

export function resolveCliSubset(
  contract: CliContract,
  filter: CliSubsetFilter,
): { entries: CliEntry[]; errors: string[] } {
  if (filter.mode === "skills") {
    const wanted = new Set(filter.names);
    return {
      entries: contract.clis.filter((item) => item.requiredBy.some((name) => wanted.has(name))),
      errors: [],
    };
  }
  if (filter.mode === "only") {
    const known = new Set(contract.clis.map((item) => item.id));
    const unknown = [...new Set(filter.ids)].filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return { entries: [], errors: unknown.map((id) => `unknown CLI id: ${id}`) };
    }
    const wanted = new Set(filter.ids);
    return {
      entries: contract.clis.filter((item) => wanted.has(item.id)),
      errors: [],
    };
  }
  return { entries: contract.clis, errors: [] };
}

const VERSION_SHAPE = /^\d+\.\d+\.\d+$/;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateStrategy(id: string, key: string, strategy: unknown, errors: string[]): void {
  if (typeof strategy !== "object" || strategy === null) {
    errors.push(`${id}: install.${key} must be an object`);
    return;
  }
  const s = strategy as Record<string, unknown>;
  if (typeof s.download !== "string") {
    errors.push(`${id}: install.${key} must declare a download url`);
    return;
  }
  if (typeof s.binary !== "string") errors.push(`${id}: install.${key} needs a binary path inside the archive`);
}

function validateEntry(raw: unknown, skillDirs: string[], hookPaths: string[], seen: Set<string>, errors: string[]): void {
  if (typeof raw !== "object" || raw === null) {
    errors.push("each clis entry must be an object");
    return;
  }
  const e = raw as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id : "<missing id>";

  if (typeof e.id !== "string" || e.id.length === 0) errors.push("entry is missing a string id");
  else if (seen.has(e.id)) errors.push(`duplicate id: ${e.id}`);
  else seen.add(e.id);

  if (typeof e.minVersion !== "string" || !VERSION_SHAPE.test(e.minVersion)) {
    errors.push(`${id}: minVersion must look like 1.10.0`);
  }
  if (!isStringArray(e.versionCommand) || e.versionCommand.length === 0) {
    errors.push(`${id}: versionCommand must be a non-empty argv array`);
  }
  if (typeof e.versionRegex !== "string") {
    errors.push(`${id}: versionRegex must be a string`);
  } else {
    try {
      new RegExp(e.versionRegex);
    } catch {
      errors.push(`${id}: versionRegex is not a valid regular expression`);
    }
  }
  if (!isStringArray(e.requiredBy) || e.requiredBy.length === 0) {
    errors.push(`${id}: requiredBy must name at least one skill`);
  } else {
    for (const name of e.requiredBy) {
      if (skillDirs.includes(name) || hookPaths.includes(name)) continue;
      errors.push(`${id}: requiredBy names ${name}, which is not a directory under skills/ or an allowed hook path`);
    }
  }
  if (e.npm !== undefined && (typeof e.npm !== "string" || e.npm.length === 0)) {
    errors.push(`${id}: npm must be a non-empty package name`);
  }
  if (e.npm !== undefined && e.install !== undefined) {
    errors.push(`${id}: declare npm or install, not both`);
  }
  if (e.install !== undefined) {
    if (typeof e.install !== "object" || e.install === null) {
      errors.push(`${id}: install must be an object`);
    } else {
      for (const [key, strategy] of Object.entries(e.install)) {
        if (!(PLATFORM_KEYS as readonly string[]).includes(key)) {
          errors.push(`${id}: unknown platform key ${key}`);
          continue;
        }
        validateStrategy(id, key, strategy, errors);
      }
    }
  }
  if (e.auth !== undefined) {
    const auth = e.auth as Record<string, unknown> | null;
    if (typeof auth !== "object" || auth === null) errors.push(`${id}: auth must be an object`);
    else {
      if (!isStringArray(auth.check)) errors.push(`${id}: auth.check must be an argv array`);
      if (typeof auth.instructions !== "string") errors.push(`${id}: auth.instructions must be a string`);
    }
  }
}

export function validateContract(raw: unknown, skillDirs: string[], hookPaths: string[] = []): string[] {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as Record<string, unknown>).clis)) {
    return ["contract must be an object with a clis array"];
  }
  const seen = new Set<string>();
  for (const entry of (raw as CliContract).clis) {
    validateEntry(entry, skillDirs, hookPaths, seen, errors);
  }
  return errors;
}
