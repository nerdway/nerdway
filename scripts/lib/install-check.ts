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

export type Finding = VersionDrift | StaleSkillCopy;
export type Runtime = "claude" | "cursor";

const REPEAT_INSTRUCTION =
  "Repeat the following warning to the user verbatim in your first reply, before anything else:";

function updateRemedy(runtime: Runtime, pluginRoot: string): string {
  if (runtime === "claude") {
    return "run /plugin marketplace update nerd4rent-claude-plugin, then /plugin update nerd4rent@nerd4rent-claude-plugin, then restart";
  }
  if (pluginRoot.includes("/.cursor/plugins/local/")) {
    return `run git -C ${pluginRoot} pull --ff-only, then Reload Window`;
  }
  return "run agent plugin marketplace remove nerd4rent-claude-plugin, then agent plugin marketplace add nerd4rent/nerd4rent-claude-plugin, then reinstall the nerd4rent card in Customize";
}

function describe(finding: Finding, runtime: Runtime, pluginRoot: string): string {
  if (finding.kind === "version-drift") {
    return `nerd4rent plugin ${finding.installed} is installed, main is ${finding.main}: ${updateRemedy(runtime, pluginRoot)}`;
  }
  return `stale copy of the nerd4rent skill ${finding.name} at ${finding.path}: remove it, the plugin ships the current version`;
}

export function renderHookOutput(findings: Finding[], runtime: Runtime, pluginRoot: string): string {
  if (findings.length === 0) return "";
  const warning = findings.map((finding) => describe(finding, runtime, pluginRoot)).join("\n");
  const context = `${REPEAT_INSTRUCTION}\n${warning}`;
  if (runtime === "claude") {
    return JSON.stringify({
      systemMessage: warning,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    });
  }
  return JSON.stringify({ additional_context: context });
}
