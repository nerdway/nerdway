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

function validateEntry(raw: unknown, skillDirs: string[], seen: Set<string>, errors: string[]): void {
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
    for (const skill of e.requiredBy) {
      if (!skillDirs.includes(skill)) errors.push(`${id}: requiredBy names ${skill}, which is not a directory under skills/`);
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

export function validateContract(raw: unknown, skillDirs: string[]): string[] {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as Record<string, unknown>).clis)) {
    return ["contract must be an object with a clis array"];
  }
  const seen = new Set<string>();
  for (const entry of (raw as CliContract).clis) {
    validateEntry(entry, skillDirs, seen, errors);
  }
  return errors;
}
