import {
  parseDocument as parseYamlDocument,
  stringify as yamlStringify,
} from "../../vendor/yaml/index.js";

export type YamlResult = {
  value?: Record<string, unknown>;
  errors: string[];
};

export type Frontmatter = {
  fields: Record<string, unknown>;
  body: string;
  error?: string;
};

const PARSE_OPTIONS = {
  prettyErrors: true,
  uniqueKeys: true,
  schema: "core",
  version: "1.2",
  maxAliasCount: 100,
  strict: true,
  customTags: [] as string[],
  resolveKnownTags: false,
  merge: false,
};

const STRINGIFY_OPTIONS = {
  schema: "core",
  version: "1.2",
  lineWidth: 0,
};

type YamlErrorLike = {
  message?: string;
  linePos?: { line: number; col: number }[];
};

type YamlDocument = {
  errors: YamlErrorLike[];
  warnings: YamlErrorLike[];
  contents: unknown;
  toJS: () => unknown;
  toString: (options?: { lineWidth?: number }) => string;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => boolean;
  setIn: (path: Iterable<unknown>, value: unknown) => void;
  deleteIn: (path: Iterable<unknown>) => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstLine(message: string): string {
  const line = message.split("\n", 1)[0] ?? message;
  return line.replace(/:\s*$/, "");
}

function formatError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const err = error as YamlErrorLike;
    const message = firstLine(typeof err.message === "string" ? err.message : String(error));
    if (/at line \d+/.test(message)) return message;
    const line = err.linePos?.[0]?.line;
    const col = err.linePos?.[0]?.col;
    if (line !== undefined) return `line ${line}, column ${col ?? 1}: ${message}`;
    return message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function documentErrors(doc: YamlDocument): string[] {
  const errors = doc.errors.map(formatError);
  for (const warning of doc.warnings) {
    const message = formatError(warning);
    if (/Unresolved tag/i.test(message)) errors.push(message);
  }
  return errors;
}

function loadDocument(text: string): { doc: YamlDocument; errors: string[] } {
  try {
    const doc = parseYamlDocument(text, PARSE_OPTIONS) as YamlDocument;
    return { doc, errors: documentErrors(doc) };
  } catch (error) {
    return { doc: parseYamlDocument("", PARSE_OPTIONS) as YamlDocument, errors: [formatError(error)] };
  }
}

export function stringifyNumbers(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringifyNumbers);
  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(value)) next[key] = stringifyNumbers(value[key]);
    return next;
  }
  return value;
}

export function parseDocument(text: string): YamlResult {
  const { doc, errors } = loadDocument(text);
  if (errors.length > 0) return { errors };
  let value: unknown;
  try {
    value = doc.toJS();
  } catch (error) {
    return { errors: [formatError(error)] };
  }
  if (value === null || value === undefined) return { value: {}, errors: [] };
  if (!isRecord(value)) return { errors: ["YAML root must be a mapping"] };
  return { value, errors: [] };
}

export function parseConfig(text: string): YamlResult {
  const parsed = parseDocument(text);
  if (parsed.value === undefined) return parsed;
  return { value: stringifyNumbers(parsed.value) as Record<string, unknown>, errors: [] };
}

export function stringify(value: unknown): string {
  return yamlStringify(value, STRINGIFY_OPTIONS);
}

export function patchSections(text: string, set: Record<string, unknown>, remove: readonly string[] = []): string {
  const { doc, errors } = loadDocument(text);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  for (const key of remove) doc.delete(key);
  for (const [key, value] of Object.entries(set)) doc.set(key, value);
  return doc.toString({ lineWidth: 0 });
}

export function patchSection(text: string, key: string, value: unknown): string {
  if (!key.includes(".")) {
    if (value === undefined) return patchSections(text, {}, [key]);
    return patchSections(text, { [key]: value });
  }
  const { doc, errors } = loadDocument(text);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const path = key.split(".");
  if (value === undefined) doc.deleteIn(path);
  else doc.setIn(path, value);
  return doc.toString({ lineWidth: 0 });
}

export function readFrontmatter(text: string): Frontmatter {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { fields: {}, body: "", error: "no YAML frontmatter on the first line" };
  }
  const rest = normalized.slice(4);
  const end = rest.indexOf("\n---");
  if (end === -1) return { fields: {}, body: "", error: "YAML frontmatter is not closed" };
  const yamlText = rest.slice(0, end);
  let after = rest.slice(end + 4);
  if (after.startsWith("\n")) after = after.slice(1);
  if (after.startsWith("\n")) after = after.slice(1);
  if (yamlText.trim() === "") return { fields: {}, body: after };
  const parsed = parseDocument(yamlText);
  if (parsed.errors.length > 0) return { fields: {}, body: after, error: parsed.errors[0] };
  return { fields: parsed.value ?? {}, body: after };
}
