import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { validatePlatformConfig, type PlatformVocabulary } from "../types/platform-config.ts";
import { configPaths, type ConfigLocationOptions } from "./config-location.ts";
import {
  applyDefaults,
  unsupportedSchemaKeywords,
  validateAgainstSchema,
  type SectionSchema,
} from "./section-schema.ts";
import { parseConfig, patchSection, patchSections } from "./yaml.ts";

export type SectionScope = "core" | "extension";

export type SectionContext = {
  vocabulary: PlatformVocabulary;
  trackerAdapter: string | undefined;
};

export type CoreSectionDefinition = {
  id: string;
  scope: "core";
  keys: readonly string[];
  schema: SectionSchema;
  validate?: (value: unknown, context: SectionContext) => string[];
  description: string;
};

export type ExtensionSectionDefinition = {
  id: string;
  scope: "extension";
  schema: SectionSchema;
  description: string;
};

export type SectionDefinition = CoreSectionDefinition | ExtensionSectionDefinition;

export type DefineSectionInput =
  | {
      id: string;
      scope: "core";
      keys: readonly string[];
      schema: SectionSchema;
      validate?: (value: unknown, context: SectionContext) => string[];
      description: string;
    }
  | {
      id: string;
      scope: "extension";
      schema: SectionSchema;
      description: string;
      validate?: unknown;
      keys?: unknown;
    };

export type SectionRegistry = {
  registerSection: (def: SectionDefinition) => void;
  listSections: () => readonly SectionDefinition[];
  getSection: (id: string) => SectionDefinition | undefined;
};

export type ReadSectionStatus = "absent" | "found" | "invalid";

export type ReadSectionResult =
  | { status: "found"; value: unknown; errors: [] }
  | { status: "absent"; value: undefined; errors: [] }
  | { status: "invalid"; value: undefined; errors: string[] };

export type WriteSectionResult = { status: "ok"; path: string } | { status: "invalid"; errors: string[] };

export type SectionIOOptions = ConfigLocationOptions & {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  registry?: SectionRegistry;
  vocabulary?: PlatformVocabulary;
  trackerAdapters?: ReadonlyMap<string, string>;
  layer?: "defaults" | "project";
};

export type WriteSectionOptions = SectionIOOptions & {
  target: "defaults" | "project";
};

const EXTENSION_ID = /^[a-z][a-z0-9-]*$/;
const RESERVED_KEY = "extensions";
const EMPTY_VOCABULARY: PlatformVocabulary = { trackers: [], vcs: [], strategies: [], phases: [] };

type RegistryState = {
  byId: Map<string, SectionDefinition>;
  keyOwner: Map<string, string>;
  frozen: boolean;
};

type YamlFile = { kind: "missing" } | { kind: "ok"; value: Record<string, unknown>; text: string } | { kind: "invalid"; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readYamlFile(path: string): YamlFile {
  if (!isFile(path)) return { kind: "missing" };
  const text = readFileSync(path, "utf8");
  const parsed = parseConfig(text);
  if (parsed.value === undefined) return { kind: "invalid", errors: parsed.errors };
  return { kind: "ok", value: parsed.value, text };
}

function fail(message: string): never {
  throw new Error(message);
}

export function defineSection(input: DefineSectionInput): SectionDefinition {
  if (typeof input.id !== "string" || input.id.length === 0) fail("section id must be a non-empty string");
  if (typeof input.description !== "string" || input.description.length === 0) {
    fail(`section ${input.id}: description must be a non-empty string`);
  }
  const schemaErrors = unsupportedSchemaKeywords(input.schema);
  if (schemaErrors.length > 0) fail(`section ${input.id}: ${schemaErrors[0]}`);
  if (input.scope === "extension") {
    if (!EXTENSION_ID.test(input.id)) fail(`extension section id ${input.id} must match ${EXTENSION_ID.source}`);
    if (input.validate !== undefined) fail(`extension section ${input.id} may not have a validate function`);
    if (input.keys !== undefined) fail(`extension section ${input.id} may not own top-level keys`);
    return Object.freeze({ id: input.id, scope: "extension", schema: input.schema, description: input.description });
  }
  if (input.scope !== "core") fail(`section ${input.id}: scope must be core or extension`);
  if (!Array.isArray(input.keys) || input.keys.length === 0) fail(`core section ${input.id} requires keys`);
  if (input.keys.some((key) => typeof key !== "string" || key.length === 0)) {
    fail(`core section ${input.id} keys must be non-empty strings`);
  }
  if (new Set(input.keys).size !== input.keys.length) fail(`core section ${input.id} keys must be unique`);
  return Object.freeze({
    id: input.id,
    scope: "core",
    keys: Object.freeze([...input.keys]),
    schema: input.schema,
    validate: input.validate,
    description: input.description,
  });
}

function registerInto(state: RegistryState, def: SectionDefinition): void {
  if (state.frozen) fail("section registry is frozen");
  const section = def.scope === "core" || def.scope === "extension" ? def : fail("section scope must be core or extension");
  if (state.byId.has(section.id)) fail(`section ${section.id} is already registered`);
  const schemaErrors = unsupportedSchemaKeywords(section.schema);
  if (schemaErrors.length > 0) fail(`section ${section.id}: ${schemaErrors[0]}`);
  if (section.scope === "extension") {
    if (!EXTENSION_ID.test(section.id)) fail(`extension section id ${section.id} must match ${EXTENSION_ID.source}`);
    if ("validate" in section && section.validate !== undefined) {
      fail(`extension section ${section.id} may not have a validate function`);
    }
  } else {
    for (const key of section.keys) {
      if (key === RESERVED_KEY) fail(`core section ${section.id} cannot own the reserved key ${RESERVED_KEY}`);
      const owner = state.keyOwner.get(key);
      if (owner !== undefined) fail(`section ${section.id} collides on key ${key} with ${owner}`);
    }
    for (const key of section.keys) state.keyOwner.set(key, section.id);
  }
  state.byId.set(section.id, section);
}

function createRegistry(seed: readonly SectionDefinition[], frozen: boolean): SectionRegistry {
  const state: RegistryState = { byId: new Map(), keyOwner: new Map(), frozen: false };
  const registry: SectionRegistry = {
    registerSection: (def) => registerInto(state, def),
    listSections: () => Object.freeze([...state.byId.values()]),
    getSection: (id) => state.byId.get(id),
  };
  for (const def of seed) registerInto(state, def);
  state.frozen = frozen;
  return Object.freeze(registry);
}

const PLATFORM_SCHEMA: SectionSchema = {
  type: "object",
  properties: {
    tracker: { type: "string", description: "Tracker adapter id" },
    vcs: { type: "string", description: "VCS host adapter id" },
    statuses: {
      type: "object",
      properties: {
        strategy: { type: "string" },
        map: { type: "object", additionalProperties: { type: "string" } },
      },
    },
    linear: { type: "object" },
    github: { type: "object" },
    gitlab: { type: "object" },
    ado: { type: "object" },
    jira: { type: "object" },
  },
};

const WIKI_SCHEMA: SectionSchema = {
  type: "object",
  properties: {
    path: { type: "string", minLength: 1, description: "Vault directory" },
  },
  description: "Wiki location",
};

const PR_SCHEMA: SectionSchema = {
  type: "object",
  properties: {
    collapse_details: {
      type: "boolean",
      default: true,
      description: "Collapse readiness PR details behind a Summary",
    },
  },
  description: "Pull request description layout",
};

const BUILTIN_SECTIONS: readonly SectionDefinition[] = [
  defineSection({
    id: "platform",
    scope: "core",
    keys: ["tracker", "vcs", "statuses", "linear", "github", "gitlab", "ado", "jira"],
    schema: PLATFORM_SCHEMA,
    description: "Tracker, VCS host, adapter blocks and status bindings",
    validate: (value, context) =>
      isRecord(value) ? validatePlatformConfig(value, context.vocabulary, context.trackerAdapter) : ["platform: expected object"],
  }),
  defineSection({
    id: "wiki",
    scope: "core",
    keys: ["wiki"],
    schema: WIKI_SCHEMA,
    description: "Vault directory",
  }),
  defineSection({
    id: "pr",
    scope: "core",
    keys: ["pr"],
    schema: PR_SCHEMA,
    description: "Readiness pull request layout",
  }),
];

export function createSectionRegistry(): SectionRegistry {
  return createRegistry(BUILTIN_SECTIONS, false);
}

const defaultRegistry = createRegistry(BUILTIN_SECTIONS, true);

function registryOf(registry?: SectionRegistry): SectionRegistry {
  return registry ?? defaultRegistry;
}

export function registerSection(def: SectionDefinition, registry: SectionRegistry = defaultRegistry): void {
  registry.registerSection(def);
}

export function listSections(registry: SectionRegistry = defaultRegistry): readonly SectionDefinition[] {
  return registry.listSections();
}

export function getSection(id: string, registry: SectionRegistry = defaultRegistry): SectionDefinition | undefined {
  return registry.getSection(id);
}

function sectionPresent(config: Record<string, unknown>, section: SectionDefinition): boolean {
  if (section.scope === "extension") {
    return isRecord(config.extensions) && Object.hasOwn(config.extensions, section.id);
  }
  return section.keys.some((key) => Object.hasOwn(config, key));
}

function extractSectionValue(section: SectionDefinition, config: Record<string, unknown>): unknown {
  if (section.scope === "extension") {
    if (!isRecord(config.extensions) || !Object.hasOwn(config.extensions, section.id)) return undefined;
    return config.extensions[section.id];
  }
  if (section.keys.length === 1) {
    const key = section.keys[0];
    return Object.hasOwn(config, key) ? config[key] : undefined;
  }
  const next: Record<string, unknown> = {};
  let present = false;
  for (const key of section.keys) {
    if (!Object.hasOwn(config, key)) continue;
    next[key] = config[key];
    present = true;
  }
  return present ? next : undefined;
}

function schemaPath(section: SectionDefinition): string {
  if (section.scope === "extension") return `${RESERVED_KEY}.${section.id}`;
  if (section.keys.length === 1) return section.keys[0];
  return section.id;
}

function validateSectionValue(section: SectionDefinition, value: unknown, context: SectionContext): string[] {
  const path = schemaPath(section);
  const errors = validateAgainstSchema(value, section.schema, path);
  if (section.scope === "core" && section.validate !== undefined) {
    errors.push(...section.validate(value, context));
  }
  return errors;
}

function sectionContextFrom(
  value: unknown,
  options: { vocabulary?: PlatformVocabulary; trackerAdapters?: ReadonlyMap<string, string> },
): SectionContext {
  const vocabulary = options.vocabulary ?? EMPTY_VOCABULARY;
  const tracker = isRecord(value) && typeof value.tracker === "string" ? value.tracker : undefined;
  return {
    vocabulary,
    trackerAdapter: tracker === undefined ? undefined : options.trackerAdapters?.get(tracker),
  };
}

function knownTopLevelKeys(registry: SectionRegistry): Set<string> {
  const keys = new Set<string>([RESERVED_KEY]);
  for (const section of registry.listSections()) {
    if (section.scope === "core") {
      for (const key of section.keys) keys.add(key);
    }
  }
  return keys;
}

export function inspectConfig(
  raw: Record<string, unknown>,
  context: SectionContext,
  registry: SectionRegistry = defaultRegistry,
): { errors: string[]; notices: string[] } {
  const errors: string[] = [];
  const notices: string[] = [];
  const known = knownTopLevelKeys(registry);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) notices.push(`unknown section ${key}; use extensions: for third-party settings`);
  }
  if (Object.hasOwn(raw, RESERVED_KEY)) {
    if (!isRecord(raw.extensions)) {
      errors.push("extensions must be a map");
    } else {
      for (const id of Object.keys(raw.extensions)) {
        const section = registry.getSection(id);
        if (section === undefined || section.scope !== "extension") {
          notices.push(`extensions.${id}: no section registered`);
        }
      }
    }
  }
  for (const section of registry.listSections()) {
    if (!sectionPresent(raw, section)) continue;
    const value = extractSectionValue(section, raw);
    if (value === undefined) continue;
    errors.push(...validateSectionValue(section, value, context));
  }
  return { errors, notices };
}

export function validateKnownSections(
  raw: Record<string, unknown>,
  context: SectionContext,
  registry: SectionRegistry = defaultRegistry,
): { errors: string[]; notices: string[] } {
  return inspectConfig(raw, context, registry);
}

export function unknownSectionNotices(
  config: Record<string, unknown>,
  where?: string,
  registry: SectionRegistry = defaultRegistry,
): string[] {
  const { notices } = inspectConfig(config, { vocabulary: EMPTY_VOCABULARY, trackerAdapter: undefined }, registry);
  const prefix = where === undefined ? "" : `${where}: `;
  return notices.map((notice) => `${prefix}${notice}`);
}

export function hasSection(id: string, config: Record<string, unknown>, registry: SectionRegistry = defaultRegistry): boolean {
  const section = registry.getSection(id);
  return section !== undefined && sectionPresent(config, section);
}

export function extractSection(
  id: string,
  config: Record<string, unknown>,
  registry: SectionRegistry = defaultRegistry,
): Record<string, unknown> {
  const section = registry.getSection(id);
  if (section === undefined) return {};
  const value = extractSectionValue(section, config);
  return isRecord(value) ? value : {};
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

function mergeSectionValue(section: SectionDefinition, defaults: Record<string, unknown>, project: Record<string, unknown>): unknown {
  const fromDefaults = extractSectionValue(section, defaults);
  const fromProject = extractSectionValue(section, project);
  if (fromDefaults === undefined && fromProject === undefined) return undefined;
  if (section.scope === "core" && section.keys.length > 1) {
    return { ...(isRecord(fromDefaults) ? fromDefaults : {}), ...(isRecord(fromProject) ? fromProject : {}) };
  }
  return fromProject !== undefined ? fromProject : fromDefaults;
}

function extensionsMapError(config: Record<string, unknown>): string[] {
  if (Object.hasOwn(config, RESERVED_KEY) && !isRecord(config.extensions)) return ["extensions must be a map"];
  return [];
}

function resultFromValue(section: SectionDefinition, value: unknown, context: SectionContext): ReadSectionResult {
  if (value === undefined) return { status: "absent", value: undefined, errors: [] };
  const withDefaults = applyDefaults(value, section.schema);
  const errors = validateSectionValue(section, withDefaults, context);
  if (errors.length > 0) return { status: "invalid", value: undefined, errors };
  return { status: "found", value: withDefaults, errors: [] };
}

function loadConfigFiles(options: SectionIOOptions): {
  defaults: YamlFile;
  project: YamlFile;
  defaultsPath: string;
  projectPath: string;
  slug: string;
} {
  const { configDir, slug } = configPaths(options.repoRoot, options.env, options);
  const defaultsPath = join(configDir, "config.yml");
  const projectPath = join(configDir, slug, "config.yml");
  return {
    defaults: readYamlFile(defaultsPath),
    project: slug.length === 0 ? { kind: "missing" } : readYamlFile(projectPath),
    defaultsPath,
    projectPath,
    slug,
  };
}

function filePrefix(slug: string, layer: "defaults" | "project"): string {
  if (layer === "defaults") return "config.yml";
  return slug.length === 0 ? "project config" : `${slug}/config.yml`;
}

function parseErrorsOf(file: YamlFile, where: string): string[] {
  return file.kind === "invalid" ? file.errors.map((error) => `${where}: ${error}`) : [];
}

function valueOf(file: YamlFile): Record<string, unknown> {
  return file.kind === "ok" ? file.value : {};
}

export function readSection(id: string, options: SectionIOOptions): ReadSectionResult {
  const registry = registryOf(options.registry);
  const section = registry.getSection(id);
  if (section === undefined) return { status: "invalid", value: undefined, errors: [`no section registered: ${id}`] };
  const loaded = loadConfigFiles(options);
  if (options.layer === "defaults") {
    const errors = parseErrorsOf(loaded.defaults, "config.yml");
    if (errors.length > 0) return { status: "invalid", value: undefined, errors };
    const raw = valueOf(loaded.defaults);
    const mapErrors = extensionsMapError(raw);
    if (mapErrors.length > 0) return { status: "invalid", value: undefined, errors: mapErrors.map((error) => `config.yml: ${error}`) };
    return prefixRead(resultFromValue(section, extractSectionValue(section, raw), sectionContextFrom(extractSectionValue(section, raw), options)), "config.yml");
  }
  if (options.layer === "project") {
    const where = filePrefix(loaded.slug, "project");
    const errors = parseErrorsOf(loaded.project, where);
    if (errors.length > 0) return { status: "invalid", value: undefined, errors };
    const raw = valueOf(loaded.project);
    const mapErrors = extensionsMapError(raw);
    if (mapErrors.length > 0) return { status: "invalid", value: undefined, errors: mapErrors.map((error) => `${where}: ${error}`) };
    return prefixRead(resultFromValue(section, extractSectionValue(section, raw), sectionContextFrom(extractSectionValue(section, raw), options)), where);
  }
  const errors = [
    ...parseErrorsOf(loaded.defaults, "config.yml"),
    ...parseErrorsOf(loaded.project, filePrefix(loaded.slug, "project")),
  ];
  if (errors.length > 0) return { status: "invalid", value: undefined, errors };
  const defaults = valueOf(loaded.defaults);
  const project = valueOf(loaded.project);
  const mapErrors = [...extensionsMapError(defaults), ...extensionsMapError(project), ...extensionsMapError({ ...defaults, ...project })];
  if (mapErrors.length > 0) return { status: "invalid", value: undefined, errors: mapErrors };
  const merged = mergeSectionValue(section, defaults, project);
  return resultFromValue(section, merged, sectionContextFrom(merged, options));
}

function prefixRead(result: ReadSectionResult, where: string): ReadSectionResult {
  if (result.status !== "invalid") return result;
  return { status: "invalid", value: undefined, errors: result.errors.map((error) => `${where}: ${error}`) };
}

function ownedWrite(section: SectionDefinition, value: unknown): { set: Record<string, unknown>; remove: string[]; nested?: { path: string; value: unknown } } {
  if (section.scope === "extension") {
    return { set: {}, remove: [], nested: { path: `${RESERVED_KEY}.${section.id}`, value } };
  }
  if (section.keys.length === 1) {
    return { set: { [section.keys[0]]: value }, remove: [] };
  }
  const set: Record<string, unknown> = {};
  if (isRecord(value)) {
    for (const key of section.keys) {
      if (Object.hasOwn(value, key)) set[key] = value[key];
    }
  }
  return { set, remove: [] };
}

function platformRemove(existing: Record<string, unknown>, set: Record<string, unknown>, keys: readonly string[]): string[] {
  return keys.filter((key) => Object.hasOwn(existing, key) && !Object.hasOwn(set, key));
}

export function writeSection(id: string, value: unknown, options: WriteSectionOptions): WriteSectionResult {
  const registry = registryOf(options.registry);
  const section = registry.getSection(id);
  if (section === undefined) return { status: "invalid", errors: [`no section registered: ${id}`] };
  const context = sectionContextFrom(value, options);
  const errors = validateSectionValue(section, applyDefaults(value, section.schema), context);
  if (errors.length > 0) return { status: "invalid", errors };
  const loaded = loadConfigFiles(options);
  const targetIsDefaults = options.target === "defaults";
  const file = targetIsDefaults ? loaded.defaults : loaded.project;
  const path = targetIsDefaults ? loaded.defaultsPath : loaded.projectPath;
  const where = filePrefix(loaded.slug, targetIsDefaults ? "defaults" : "project");
  if (!targetIsDefaults && loaded.slug.length === 0) return { status: "invalid", errors: ["project slug is empty"] };
  if (file.kind === "invalid") return { status: "invalid", errors: parseErrorsOf(file, where) };
  const other = targetIsDefaults ? loaded.project : loaded.defaults;
  if (other.kind === "invalid") {
    const otherWhere = filePrefix(loaded.slug, targetIsDefaults ? "project" : "defaults");
    return { status: "invalid", errors: parseErrorsOf(other, otherWhere) };
  }
  const existing = file.kind === "ok" ? file.value : {};
  const plan = ownedWrite(section, value);
  const remove = section.scope === "core" && section.keys.length > 1 ? platformRemove(existing, plan.set, section.keys) : plan.remove;
  const nextTarget = applySectionPatch(existing, plan.set, remove);
  if (plan.nested !== undefined) {
    if (Object.hasOwn(existing, RESERVED_KEY) && !isRecord(existing.extensions)) {
      return { status: "invalid", errors: [`${where}: extensions must be a map`] };
    }
    const extensions = isRecord(existing.extensions) ? { ...existing.extensions } : {};
    if (plan.nested.value === undefined) delete extensions[section.id];
    else extensions[section.id] = plan.nested.value;
    nextTarget[RESERVED_KEY] = extensions;
  }
  const defaults = targetIsDefaults ? nextTarget : valueOf(loaded.defaults);
  const project = targetIsDefaults ? valueOf(loaded.project) : nextTarget;
  const merged = { ...defaults, ...project };
  const inspected = inspectConfig(merged, sectionContextFrom(extractSectionValue(getSection("platform", registry) ?? section, merged), options), registry);
  if (inspected.errors.length > 0) return { status: "invalid", errors: inspected.errors };
  const text = file.kind === "ok" ? file.text : "";
  mkdirSync(dirname(path), { recursive: true });
  let patched: string;
  if (plan.nested !== undefined) patched = patchSection(text, plan.nested.path, plan.nested.value);
  else patched = patchSections(text, plan.set, remove);
  writeFileSync(path, patched);
  return { status: "ok", path };
}
