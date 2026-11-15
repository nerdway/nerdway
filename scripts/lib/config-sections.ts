import { wikiPathFromConfig, validatePlatformConfig, type PlatformVocabulary } from "../types/platform-config.ts";

export const PLATFORM_KEYS = ["tracker", "vcs", "statuses", "linear", "github", "gitlab", "ado", "jira"] as const;
export const WIKI_KEYS = ["wiki"] as const;
export const PR_KEYS = ["pr"] as const;

export type SectionId = "platform" | "wiki" | "pr";

export type SectionContext = {
  vocabulary: PlatformVocabulary;
  trackerAdapter: string | undefined;
};

export type ConfigSection = {
  id: SectionId;
  keys: readonly string[];
  validate: (raw: Record<string, unknown>, context: SectionContext) => string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePrSection(raw: Record<string, unknown>): string[] {
  if (raw.pr === undefined) return [];
  if (!isRecord(raw.pr)) return ["pr must be an object"];
  const value = raw.pr.collapse_details;
  if (value === undefined) return [];
  if (typeof value !== "boolean") {
    return [`pr.collapse_details must be a boolean, got ${JSON.stringify(value)}`];
  }
  return [];
}

export function validateWikiSection(raw: Record<string, unknown>): string[] {
  const wiki = wikiPathFromConfig(raw);
  return wiki.kind === "invalid" ? wiki.errors : [];
}

export const CONFIG_SECTIONS: readonly ConfigSection[] = [
  {
    id: "platform",
    keys: PLATFORM_KEYS,
    validate: (raw, context) => validatePlatformConfig(raw, context.vocabulary, context.trackerAdapter),
  },
  {
    id: "wiki",
    keys: WIKI_KEYS,
    validate: (raw) => validateWikiSection(raw),
  },
  {
    id: "pr",
    keys: PR_KEYS,
    validate: (raw) => validatePrSection(raw),
  },
];

const KNOWN_KEYS = new Set(CONFIG_SECTIONS.flatMap((section) => section.keys));

export function isPlatformKey(key: string): boolean {
  return (PLATFORM_KEYS as readonly string[]).includes(key);
}

export function platformPart(config: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of PLATFORM_KEYS) {
    if (Object.hasOwn(config, key)) next[key] = config[key];
  }
  return next;
}

export function hasPlatformSection(config: Record<string, unknown>): boolean {
  return Object.keys(platformPart(config)).length > 0;
}

export function sectionPresent(config: Record<string, unknown>, section: ConfigSection): boolean {
  return section.keys.some((key) => Object.hasOwn(config, key));
}

export function unknownSectionNotices(config: Record<string, unknown>, where?: string): string[] {
  const prefix = where === undefined ? "" : `${where}: `;
  return Object.keys(config)
    .filter((key) => !KNOWN_KEYS.has(key))
    .map((key) => `${prefix}unknown section ${key}`);
}

export function validateKnownSections(
  raw: Record<string, unknown>,
  context: SectionContext,
): { errors: string[]; notices: string[] } {
  const errors: string[] = [];
  for (const section of CONFIG_SECTIONS) {
    if (!sectionPresent(raw, section)) continue;
    errors.push(...section.validate(raw, context));
  }
  return { errors, notices: unknownSectionNotices(raw) };
}

export function applySectionPatch(
  existing: Record<string, unknown>,
  set: Record<string, unknown>,
  remove: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existing };
  for (const key of remove) delete next[key];
  for (const [key, value] of Object.entries(set)) next[key] = value;
  return next;
}

export function platformReplacePlan(
  existing: Record<string, unknown>,
  input: Record<string, unknown>,
): { set: Record<string, unknown>; remove: string[] } {
  const set: Record<string, unknown> = { ...input };
  const remove = PLATFORM_KEYS.filter((key) => Object.hasOwn(existing, key) && !Object.hasOwn(input, key));
  return { set, remove };
}
