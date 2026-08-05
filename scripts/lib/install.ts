import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";

import type { CliEntry, InstallStrategy } from "../types/cli-dependencies.ts";
import { runCommand } from "./probe.ts";

export interface InstallOutcome {
  ok: boolean;
  detail: string;
  placedAt?: string;
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^(\S+)\s+\*?(\S+)$/.exec(line.trim());
    if (match) sums.set(match[2], match[1]);
  }
  return sums;
}

export function installDir(): string {
  return join(homedir(), ".local", "bin");
}

function templateVars(entry: CliEntry): Record<string, string> {
  const vars: Record<string, string> = { version: entry.minVersion };
  if (entry.releaseBase) vars.releaseBase = interpolate(entry.releaseBase, vars);
  return vars;
}

async function verifyChecksum(entry: CliEntry, vars: Record<string, string>, archive: Buffer, name: string): Promise<string> {
  if (!entry.checksums) return "checksum not declared, archive unverified";

  const response = await fetch(interpolate(entry.checksums, vars));
  if (!response.ok) return `checksums unreachable (HTTP ${response.status}), archive unverified`;

  const expected = parseChecksums(await response.text()).get(name);
  if (!expected) return `no checksum listed for ${name}, archive unverified`;

  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expected) throw new Error(`checksum mismatch for ${name}: expected ${expected}, got ${actual}`);
  return "checksum verified";
}

async function installDownload(entry: CliEntry, strategy: InstallStrategy): Promise<InstallOutcome> {
  const vars = templateVars(entry);
  const url = interpolate(strategy.download, vars);
  const name = basename(new URL(url).pathname);

  const response = await fetch(url);
  if (!response.ok) return { ok: false, detail: `download failed: HTTP ${response.status} for ${url}` };

  const archive = Buffer.from(await response.arrayBuffer());
  const note = await verifyChecksum(entry, vars, archive, name);

  const work = mkdtempSync(join(tmpdir(), "bootstrap-clis-"));
  try {
    const archivePath = join(work, name);
    writeFileSync(archivePath, archive);

    const extract = await runCommand(["tar", "-xzf", archivePath, "-C", work]);
    if (extract.code !== 0) return { ok: false, detail: `tar failed: ${extract.stderr.trim()}` };

    const extracted = join(work, strategy.binary);
    if (!existsSync(extracted)) return { ok: false, detail: `archive does not contain ${strategy.binary}` };

    const target = join(installDir(), basename(strategy.binary));
    mkdirSync(installDir(), { recursive: true });
    copyFileSync(extracted, target);
    chmodSync(target, 0o755);

    return { ok: true, detail: note, placedAt: target };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function applyInstall(entry: CliEntry, strategy: InstallStrategy): Promise<InstallOutcome> {
  try {
    return await installDownload(entry, strategy);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
