import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SourceFile {
  path: string;
  source: string;
}

export const SCRUB_PATTERN_SOURCE = "NER-|GRO-|Proxmox|Coder|pve|linear\\.app/nerd4rent";

export const EXEMPT_PATHS = [
  "docs/DUAL-TRACK.md",
  "scripts/types/scrub-check.ts",
  "scripts/types/scrub-check.test.ts",
  "scripts/scrub-check.ts",
];

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((prefix) => path === prefix || path.startsWith(prefix));
}

function lineHasPrivateTrackString(line: string): boolean {
  return new RegExp(SCRUB_PATTERN_SOURCE).test(line);
}

export function scrubCheckErrors(files: SourceFile[]): string[] {
  const errors: string[] = [];
  for (const file of files) {
    if (isExempt(file.path)) continue;
    file.source.split("\n").forEach((line, index) => {
      if (lineHasPrivateTrackString(line)) {
        errors.push(
          `${file.path}:${index + 1}: private-track string in the public tree; strip it in the export rewrite, or add the path to EXEMPT_PATHS only if the file's job is to name the scrub patterns`,
        );
      }
    });
  }
  return errors;
}

export function scrubCheckSources(repoRoot: string): SourceFile[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => ({ path, source: readFileSync(join(repoRoot, path), "utf8") }));
}

export function validateScrubCheck(repoRoot: string): string[] {
  return scrubCheckErrors(scrubCheckSources(repoRoot));
}
