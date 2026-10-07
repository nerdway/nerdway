import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const PLATFORM_RECIPE = "adapters/platform.md";

export interface SourceFile {
  path: string;
  source: string;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^## /;
const MENTION = /## Platform(?!\s+and adapters)\b/;

export const CONTEXT_ASSUMPTIONS: { pattern: RegExp; why: string }[] = [
  { pattern: /own copy of `?CLAUDE\.md/i, why: "assumes a copy of CLAUDE.md in context" },
  { pattern: /CLAUDE\.md`? is (?:already )?(?:loaded )?in(?:to)? (?:the )?context/i, why: "assumes CLAUDE.md is in context" },
  { pattern: /CLAUDE\.md`? is\s+not reloaded mid-session, so/i, why: "reasons from Claude Code's context model only" },
];

export function mentionsPlatform(source: string): boolean {
  let fenced = false;
  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      if (MENTION.test(line)) return true;
      continue;
    }
    if (!fenced && HEADING.test(line)) continue;
    if (MENTION.test(line)) return true;
  }
  return false;
}

export function platformReferenceErrors(files: SourceFile[]): string[] {
  const errors: string[] = [];
  for (const file of files) {
    if (file.path === PLATFORM_RECIPE) continue;
    if (mentionsPlatform(file.source) && !file.source.includes(PLATFORM_RECIPE)) {
      errors.push(`${file.path}: mentions \`## Platform\` without pointing at ${PLATFORM_RECIPE} — read the repo CLAUDE.md from disk with the shared recipe`);
    }
    for (const { pattern, why } of CONTEXT_ASSUMPTIONS) {
      const match = pattern.exec(file.source);
      if (match !== null) errors.push(`${file.path}: "${match[0].replace(/\s+/g, " ")}" ${why} — point at ${PLATFORM_RECIPE} instead`);
    }
  }
  return errors;
}

function markdownUnder(root: string, dir: string, keep: (name: string) => boolean): SourceFile[] {
  const base = join(root, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && keep(entry.name))
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: relative(root, full).split("\\").join("/"), source: readFileSync(full, "utf8") };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function platformReaders(repoRoot: string): SourceFile[] {
  return [
    ...markdownUnder(repoRoot, "skills", (name) => name === "SKILL.md"),
    ...markdownUnder(repoRoot, "agents", (name) => name.endsWith(".md")),
    ...markdownUnder(repoRoot, "adapters", (name) => name.endsWith(".md")),
  ];
}

export function validatePlatformReferences(repoRoot: string): string[] {
  if (!existsSync(join(repoRoot, PLATFORM_RECIPE))) return [`${PLATFORM_RECIPE}: the shared recipe is missing`];
  return platformReferenceErrors(platformReaders(repoRoot));
}
