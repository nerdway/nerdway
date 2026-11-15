// The claude.ai marketplace sync validates a plugin like a claude.ai plugin
// upload (Plugins API, "Upload requirements") and reports what breaks those
// rules as sync warnings; `claude plugin validate` checks none of them
// (DEMO-365).
import { readFrontmatter } from "../lib/yaml.ts";

export { readFrontmatter } from "../lib/yaml.ts";

export const NAME_MAX = 64;
export const DISPLAY_NAME_MAX = 64;
export const PLUGIN_DESCRIPTION_MAX = 500;
export const SKILL_DESCRIPTION_MAX = 1024;
export const RESERVED_SKILL_NAME_WORDS = ["anthropic", "claude"] as const;

const NAME = /^[\p{Ll}\p{Nd}-]+$/u;
const ANGLE_BRACKET = /[<>]/;

export type ComponentFile = { path: string; text: string };

export type ClaudeAiManifests = {
  claudePlugin: Record<string, unknown>;
  marketplace: Record<string, unknown>;
  cursorPlugin: Record<string, unknown>;
  cursorMarketplace: Record<string, unknown>;
};

export type { Frontmatter } from "../lib/yaml.ts";

function fieldString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nameErrors(label: string, name: unknown): string[] {
  if (typeof name !== "string" || name.length === 0) return [`${label}: name is missing`];
  const errors: string[] = [];
  if (name.length > NAME_MAX) errors.push(`${label}: name "${name}" is longer than ${NAME_MAX} characters`);
  if (!NAME.test(name)) {
    errors.push(`${label}: name "${name}" may hold only lowercase letters, digits and hyphens`);
  }
  return errors;
}

function pluginDescriptions(set: ClaudeAiManifests): { label: string; value: unknown }[] {
  const entries = (manifest: Record<string, unknown>, file: string) =>
    (Array.isArray(manifest.plugins) ? (manifest.plugins as Record<string, unknown>[]) : [])
      .filter((entry) => entry.name === set.claudePlugin.name || entry.name === set.cursorPlugin.name)
      .map((entry) => ({ label: `${file} plugins[${String(entry.name)}]`, value: entry.description }));
  return [
    { label: ".claude-plugin/plugin.json", value: set.claudePlugin.description },
    ...entries(set.marketplace, ".claude-plugin/marketplace.json"),
    { label: ".cursor-plugin/plugin.json", value: set.cursorPlugin.description },
    ...entries(set.cursorMarketplace, ".cursor-plugin/marketplace.json"),
  ];
}

export function validatePluginForClaudeAi(set: ClaudeAiManifests): string[] {
  const errors = nameErrors(".claude-plugin/plugin.json", set.claudePlugin.name);

  const displayName = set.claudePlugin.displayName;
  if (typeof displayName === "string" && displayName.length > DISPLAY_NAME_MAX) {
    errors.push(`.claude-plugin/plugin.json: displayName is longer than ${DISPLAY_NAME_MAX} characters`);
  }

  const descriptions = pluginDescriptions(set);
  for (const { label, value } of descriptions) {
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${label}: description is missing`);
    } else if (value.length > PLUGIN_DESCRIPTION_MAX) {
      errors.push(
        `${label}: description has ${value.length} characters; claude.ai accepts at most ${PLUGIN_DESCRIPTION_MAX}`,
      );
    }
  }
  const canonical = set.claudePlugin.description;
  for (const { label, value } of descriptions.slice(1)) {
    if (typeof value === "string" && typeof canonical === "string" && value !== canonical) {
      errors.push(`${label}: description differs from .claude-plugin/plugin.json description`);
    }
  }

  return errors;
}

function componentErrors(kind: "skill" | "agent", files: ComponentFile[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const { fields, error } = readFrontmatter(file.text);
    if (error !== undefined) {
      errors.push(`${file.path}: ${error}`);
      continue;
    }
    const name = fieldString(fields.name);
    const description = fieldString(fields.description);
    errors.push(...nameErrors(file.path, name));
    if (name !== undefined && ANGLE_BRACKET.test(name)) {
      errors.push(`${file.path}: name contains "<" or ">"; claude.ai rejects XML tags in it`);
    }
    if (kind === "skill" && name !== undefined) {
      for (const word of RESERVED_SKILL_NAME_WORDS) {
        if (name.includes(word)) errors.push(`${file.path}: skill name "${name}" contains the reserved word "${word}"`);
      }
    }
    if (description === undefined || description.length === 0) {
      errors.push(`${file.path}: description is missing`);
    } else {
      if (ANGLE_BRACKET.test(description)) {
        errors.push(
          `${file.path}: description contains "<" or ">"; claude.ai rejects XML tags and strips angle brackets from it`,
        );
      }
      if (kind === "skill" && description.length > SKILL_DESCRIPTION_MAX) {
        errors.push(
          `${file.path}: description has ${description.length} characters; skills accept at most ${SKILL_DESCRIPTION_MAX}`,
        );
      }
    }
    if (name !== undefined) {
      const first = seen.get(name);
      if (first !== undefined) errors.push(`${file.path}: ${kind} name "${name}" is already used by ${first}`);
      else seen.set(name, file.path);
    }
  }

  return errors;
}

export function validateComponentsForClaudeAi(skills: ComponentFile[], agents: ComponentFile[]): string[] {
  return [...componentErrors("skill", skills), ...componentErrors("agent", agents)];
}
