import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { VERSION_FILE, type VendorManifest } from "./types/vendor.ts";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const TARBALL = (version: string) => `https://registry.npmjs.org/yaml/-/yaml-${version}.tgz`;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out.sort();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function download(url: string, path: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: ${url} (${response.status} ${response.statusText})`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

export async function vendorYaml(version: string, root = repoRoot): Promise<string> {
  if (!VERSION.test(version)) throw new Error(`version must look like 2.9.1, got ${version}`);
  const url = TARBALL(version);
  const work = mkdtempSync(join(tmpdir(), "nerdway-vendor-yaml-"));
  try {
    const tarball = join(work, "yaml.tgz");
    await download(url, tarball);
    execFileSync("tar", ["-xzf", tarball, "-C", work], { stdio: ["ignore", "pipe", "pipe"] });
    const extracted = join(work, "package");
    const browser = join(extracted, "browser");
    const license = join(extracted, "LICENSE");
    const target = join(root, "vendor", "yaml");
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(browser, target, { recursive: true });
    writeFileSync(join(target, "LICENSE"), readFileSync(license));
    // Nested "type": "module" so node can load the ESM build without a root package.json.
    writeFileSync(join(target, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
    const files: Record<string, string> = {};
    for (const rel of listFiles(target)) {
      if (rel === VERSION_FILE) continue;
      files[rel] = sha256(join(target, rel));
    }
    const manifest: VendorManifest = { version, tarball: url, files };
    writeFileSync(join(target, VERSION_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    return target;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  const version = process.argv[2];
  if (version === undefined || version.length === 0) {
    console.error("usage: node scripts/vendor-yaml.ts <version>");
    process.exit(1);
  }
  try {
    const path = await vendorYaml(version);
    const count = Object.keys(JSON.parse(readFileSync(join(path, VERSION_FILE), "utf8")).files).length;
    console.log(`OK: vendored yaml ${version} (${count} files) to ${relative(repoRoot, path) || path}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
