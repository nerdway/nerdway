import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SourceFile {
  path: string;
  source: string;
}

const EXTERNAL_SKILL_CALL = /\b(superpowers|mattpocock-skills):[\w-]+/g;

export const EXEMPT_PATHS = [
  "docs/research/",
  "docs/plans/",
  "docs/specs/",
  "scripts/types/external-references.ts",
  "scripts/types/external-references.test.ts",
];

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.some((prefix) => path.startsWith(prefix));
}

export function externalReferenceErrors(files: SourceFile[]): string[] {
  const errors: string[] = [];
  for (const file of files) {
    if (isExempt(file.path)) continue;
    file.source.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(EXTERNAL_SKILL_CALL)) {
        errors.push(`${file.path}:${index + 1}: calls the external skill \`${match[0]}\` — the plugin ships its own practices, so name a \`nerd4rent:\` skill or describe the step inline`);
      }
    });
  }
  return errors;
}

export function externalReferenceSources(repoRoot: string): SourceFile[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => ({ path, source: readFileSync(join(repoRoot, path), "utf8") }));
}

export function validateExternalReferences(repoRoot: string): string[] {
  return externalReferenceErrors(externalReferenceSources(repoRoot));
}
