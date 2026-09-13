import { hasRecipes, sectionBody, tableRows, UNSUPPORTED } from "./workflow-graph.ts";

export interface PlatformVocabulary {
  trackers: string[];
  vcs: string[];
  strategies: string[];
  phases: string[];
}

export interface YamlResult {
  value?: Record<string, unknown>;
  errors: string[];
}

export interface PlatformYaml {
  yaml?: string;
  errors: string[];
}

const RESERVED = { open: "backlog", closed: "done" } as const;

const YAML_LINE = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/;
const UNSUPPORTED_SCALAR = /^[[{|>&*!-]/;
const QUOTED_SCALAR = /^(["'])(.*)\1(?:\s+#.*)?$/;
const SHELL_UNSAFE = /['"`$\\\n]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function scalar(value: string): string {
  const quoted = QUOTED_SCALAR.exec(value);
  if (quoted !== null) return quoted[2];
  const comment = value.search(/\s#/);
  return (comment === -1 ? value : value.slice(0, comment)).trim();
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function parseYaml(text: string): YamlResult {
  const root: Record<string, unknown> = {};
  const stack: { indent: number; childIndent?: number; node: Record<string, unknown> }[] = [{ indent: -1, node: root }];
  const errors: string[] = [];

  text.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const where = `line ${index + 1}`;
    const indent = line.length - line.trimStart().length;
    const match = YAML_LINE.exec(trimmed);
    if (/^\s*\t/.test(line) || match === null) {
      errors.push(`${where}: unsupported YAML — only nested \`key: value\` maps are read`);
      return;
    }
    while (indent <= stack[stack.length - 1].indent) stack.pop();
    const frame = stack[stack.length - 1];
    frame.childIndent ??= indent;
    if (indent !== frame.childIndent) {
      errors.push(`${where}: inconsistent indentation — siblings of one map must start in the same column`);
      return;
    }
    const parent = frame.node;
    const [, key, rawValue] = match;
    if (key === "__proto__") {
      errors.push(`${where}: key __proto__ is not allowed`);
      return;
    }
    if (Object.hasOwn(parent, key)) {
      errors.push(`${where}: duplicate key ${key}`);
      return;
    }
    if (rawValue === undefined || rawValue.trim() === "") {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, node: child });
      return;
    }
    const value = rawValue.trim();
    if (UNSUPPORTED_SCALAR.test(value)) {
      errors.push(`${where}: unsupported YAML value for ${key} — lists, flow collections and block scalars are not read`);
      return;
    }
    parent[key] = scalar(value);
  });

  return errors.length > 0 ? { errors } : { value: root, errors };
}

function onlyYamlBlock(body: string, where: string): PlatformYaml {
  const blocks = [...body.matchAll(/^```yaml\n([\s\S]*?)\n```$/gm)].map((match) => match[1]);
  if (blocks.length !== 1) return { errors: [`${where} must hold exactly one fenced yaml block, found ${blocks.length}`] };
  return { yaml: blocks[0], errors: [] };
}

export function platformYaml(markdown: string): PlatformYaml {
  const body = sectionBody(normalizeNewlines(markdown), "Platform");
  if (body === undefined) return { errors: ["no line-start ## Platform section"] };
  return onlyYamlBlock(body, "## Platform");
}

export function supportedStrategies(adapterSource: string): string[] {
  const table = sectionBody(adapterSource, "Status strategies") ?? "";
  return tableRows(table)
    .filter(hasRecipes)
    .map(([strategy]) => strategy);
}

function validateMap(where: string, strategy: unknown, raw: unknown, vocabulary: PlatformVocabulary, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${where}.map must map every phase to a value`);
    return;
  }
  for (const phase of vocabulary.phases) {
    const value = raw[phase];
    if (typeof value !== "string" || value.length === 0) {
      errors.push(`${where}.map is missing phase ${phase}`);
    } else if (SHELL_UNSAFE.test(value)) {
      errors.push(`${where}.map.${phase} holds a quote, backtick, $, backslash or newline — adapter recipes interpolate the value into shell commands`);
    }
  }
  for (const key of Object.keys(raw).filter((key) => !vocabulary.phases.includes(key))) {
    errors.push(`${where}.map names ${key}, which is not a canonical phase`);
  }

  const phasesByValue = new Map<string, string[]>();
  for (const phase of vocabulary.phases) {
    const value = raw[phase];
    if (typeof value === "string") phasesByValue.set(value, [...(phasesByValue.get(value) ?? []), phase]);
  }
  for (const [value, phases] of phasesByValue) {
    if (phases.length > 1) errors.push(`${where}.map maps ${value} to ${phases.join(" and ")} — a value read back must name one phase`);
  }

  if (strategy === undefined) return;
  for (const [reserved, phase] of Object.entries(RESERVED)) {
    const users = phasesByValue.get(reserved) ?? [];
    if (users.length === 0) continue;
    if (strategy !== "label") {
      errors.push(`${where}.map uses ${reserved}, which is reserved to the label strategy`);
    } else if (users.some((user) => user !== phase)) {
      errors.push(`${where}.map uses ${reserved} for ${users.join(", ")} — under label it may only map ${phase}`);
    }
  }
  if (strategy === "label" && raw.done !== "closed" && typeof raw.done === "string") {
    errors.push(`${where}.map.done must be closed under label, so a merge that closes the issue lands on done`);
  }
}

function validateStatuses(where: string, raw: unknown, vocabulary: PlatformVocabulary, supported: string[]): string[] {
  const errors: string[] = [];
  if (!isRecord(raw)) return [`${where} must be an object with strategy and map`];
  const strategy = raw.strategy;
  if (typeof strategy !== "string" || !vocabulary.strategies.includes(strategy)) {
    errors.push(`${where}.strategy ${String(strategy)} is not one of ${vocabulary.strategies.join(", ")}`);
  } else if (!supported.includes(strategy)) {
    errors.push(`${where}.strategy ${strategy} is not supported by the tracker adapter (its Status strategies row is ${UNSUPPORTED})`);
  }
  const knownStrategy = typeof strategy === "string" && vocabulary.strategies.includes(strategy) ? strategy : undefined;
  validateMap(where, knownStrategy, raw.map, vocabulary, errors);
  return errors;
}

export function validatePlatformConfig(raw: unknown, vocabulary: PlatformVocabulary, trackerAdapter: string | undefined): string[] {
  if (!isRecord(raw)) return ["platform config must be a YAML map"];
  const errors: string[] = [];
  if (typeof raw.tracker !== "string" || !vocabulary.trackers.includes(raw.tracker)) {
    errors.push(`tracker ${String(raw.tracker)} is not one of ${vocabulary.trackers.join(", ")}`);
  }
  if (typeof raw.vcs !== "string" || !vocabulary.vcs.includes(raw.vcs)) {
    errors.push(`vcs ${String(raw.vcs)} is not one of ${vocabulary.vcs.join(", ")}`);
  }
  if (raw.statuses === undefined) return errors;
  if (raw.tracker === "none") {
    errors.push("statuses is set, but tracker is none — there is no tracker to bind phases to");
  } else if (trackerAdapter === undefined) {
    errors.push(`statuses is set, but adapter trackers/${String(raw.tracker)} is not available to check it against`);
  } else {
    errors.push(...validateStatuses("statuses", raw.statuses, vocabulary, supportedStrategies(trackerAdapter)));
  }
  return errors;
}

export function validateAdapterDefaults(name: string, adapterSource: string, vocabulary: PlatformVocabulary): string[] {
  const where = `adapters/trackers/${name}.md ## Statuses`;
  const source = normalizeNewlines(adapterSource);
  const block = onlyYamlBlock(sectionBody(source, "Statuses") ?? "", where);
  if (block.yaml === undefined) return block.errors;
  const parsed = parseYaml(block.yaml);
  if (parsed.value === undefined) return parsed.errors.map((error) => `${where}: ${error}`);
  return validateStatuses(where, parsed.value, vocabulary, supportedStrategies(source));
}
