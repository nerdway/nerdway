import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export interface ResolveSlugOptions {
  aliasesPath?: string;
  gitRemote?: (projectDir: string) => string;
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
