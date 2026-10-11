import { compareVersions } from "./version.ts";

export type VersionDrift = { kind: "version-drift"; installed: string; main: string };

export function detectVersionDrift(installed: string, main: string | null): VersionDrift | null {
  if (main === null || compareVersions(installed, main) >= 0) return null;
  return { kind: "version-drift", installed, main };
}

export type StaleSkillCopy = { kind: "stale-skill-copy"; path: string; name: string };

export type SkillEntry = { path: string; text: string };

export const HISTORICAL_SKILL_NAMES = [
  "linear-issue-workflow",
  "linear-issue-writer",
  "linear-issue-close",
  "linear-continue",
] as const;

function frontmatterName(text: string): string | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!frontmatter) return null;
  const name = /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(frontmatter[1]);
  return name?.[1] ?? null;
}

export function findStaleSkillCopies(entries: SkillEntry[], currentNames: string[]): StaleSkillCopy[] {
  const historical = new Set<string>(HISTORICAL_SKILL_NAMES);
  const current = new Set(currentNames);
  const findings: StaleSkillCopy[] = [];
  for (const entry of entries) {
    const name = frontmatterName(entry.text);
    if (name === null) continue;
    const isHistorical = historical.has(name);
    const isPluginCopy = current.has(name) && /nerd4rent|nerdbrain/i.test(entry.text);
    if (isHistorical || isPluginCopy) {
      findings.push({ kind: "stale-skill-copy", path: entry.path, name });
    }
  }
  return findings;
}
