import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const VENDOR_YAML_DIR = "vendor/yaml";
export const VERSION_FILE = "VERSION.json";
const SHA256 = /^[0-9a-f]{64}$/;

export type VendorManifest = {
  version: string;
  tarball: string;
  files: Record<string, string>;
};

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readVendorManifest(repoRoot: string): { manifest: VendorManifest } | { errors: string[] } {
  const path = join(repoRoot, VENDOR_YAML_DIR, VERSION_FILE);
  if (!existsSync(path)) return { errors: [`${VENDOR_YAML_DIR}/${VERSION_FILE} is missing`] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { errors: [`${VENDOR_YAML_DIR}/${VERSION_FILE} is not valid JSON`] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { errors: [`${VENDOR_YAML_DIR}/${VERSION_FILE} must be an object`] };
  }
  const record = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof record.version !== "string" || record.version.length === 0) {
    errors.push(`${VENDOR_YAML_DIR}/${VERSION_FILE}: version is missing`);
  }
  if (typeof record.tarball !== "string" || record.tarball.length === 0) {
    errors.push(`${VENDOR_YAML_DIR}/${VERSION_FILE}: tarball is missing`);
  }
  if (typeof record.files !== "object" || record.files === null || Array.isArray(record.files)) {
    errors.push(`${VENDOR_YAML_DIR}/${VERSION_FILE}: files must be an object of path to sha256`);
    return { errors };
  }
  const files: Record<string, string> = {};
  for (const [rel, hash] of Object.entries(record.files as Record<string, unknown>)) {
    if (typeof hash !== "string" || !SHA256.test(hash)) {
      errors.push(`${VENDOR_YAML_DIR}/${VERSION_FILE}: files["${rel}"] must be a sha256 hex digest`);
      continue;
    }
    files[rel] = hash;
  }
  if (errors.length > 0) return { errors };
  return {
    manifest: {
      version: record.version as string,
      tarball: record.tarball as string,
      files,
    },
  };
}

export function validateVendor(repoRoot: string): string[] {
  const dir = join(repoRoot, VENDOR_YAML_DIR);
  if (!existsSync(dir)) return [`${VENDOR_YAML_DIR}/ is missing`];
  const loaded = readVendorManifest(repoRoot);
  if ("errors" in loaded) return loaded.errors;
  const { manifest } = loaded;
  const errors: string[] = [];
  const onDisk = new Set(listFiles(dir).filter((rel) => rel !== VERSION_FILE));
  for (const rel of Object.keys(manifest.files).sort()) {
    if (rel === VERSION_FILE) {
      errors.push(`${VENDOR_YAML_DIR}/${VERSION_FILE} must not list itself in files`);
      continue;
    }
    const path = join(dir, rel);
    if (!onDisk.has(rel)) {
      errors.push(`${VENDOR_YAML_DIR}/${rel} is listed in ${VERSION_FILE} but missing on disk`);
      continue;
    }
    const actual = sha256(path);
    if (actual !== manifest.files[rel]) {
      errors.push(`${VENDOR_YAML_DIR}/${rel} does not match the sha256 in ${VERSION_FILE}`);
    }
    onDisk.delete(rel);
  }
  for (const rel of [...onDisk].sort()) {
    errors.push(`${VENDOR_YAML_DIR}/${rel} is not listed in ${VERSION_FILE}`);
  }
  if (typeof manifest.tarball !== "string" || !manifest.tarball.includes(`yaml-${manifest.version}.tgz`)) {
    errors.push(`${VENDOR_YAML_DIR}/${VERSION_FILE}: tarball URL does not match version ${manifest.version}`);
  }
  return errors;
}
