import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface SourceFile {
  path: string;
  source: string;
}

const EM_DASH = "—";

const HUMAN_DOC_PATH = /^(README\.md|docs\/[^/]+\.md)$/;

export function humanDocErrors(files: SourceFile[]): string[] {
  const errors: string[] = [];
  for (const file of files) {
    file.source.split("\n").forEach((line, index) => {
      if (line.includes(EM_DASH)) {
        errors.push(`${file.path}:${index + 1}: em dash in documentation for humans; use a plain hyphen or rebuild the sentence`);
      }
    });
  }
  return errors;
}

export function humanDocSources(repoRoot: string): SourceFile[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((path) => HUMAN_DOC_PATH.test(path))
    .map((path) => ({ path, source: readFileSync(join(repoRoot, path), "utf8") }));
}

export function validateHumanDocs(repoRoot: string): string[] {
  return humanDocErrors(humanDocSources(repoRoot));
}
