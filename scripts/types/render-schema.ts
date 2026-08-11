import type { JsonSchema } from "./workflow-graph.ts";

/** Render the schema as an empty template rather than as a filled instance. */
export const PLACEHOLDER = Symbol("placeholder");

/** How many empty items an unfilled list opens with — enough to show it is a list. */
const EMPTY_ITEMS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Comment lines wrap here, the way the prose in this repo does. */
const WRAP_COLUMNS = 80;
const INDENT = "     ";

function comment(text: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((word) => word.length > 0)) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (candidate.length + INDENT.length > WRAP_COLUMNS && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines.map((entry, index) => (index === 0 ? `<!-- ${entry}` : `${INDENT}${entry}`)).join("\n") + " -->";
}

function marker(property: JsonSchema, index: number): string {
  if (property["x-render"] === "checklist") return "- [ ]";
  if (property["x-render"] === "numbered") return `${index + 1}.`;
  return "-";
}

const LOCAL_REF = "#/$defs/";

function resolve(schema: JsonSchema | undefined, defs: Record<string, JsonSchema>): JsonSchema | undefined {
  if (schema?.$ref?.startsWith(LOCAL_REF) === true) return defs[schema.$ref.slice(LOCAL_REF.length)];
  return schema;
}

/** A cell may not carry the characters that end a cell or a row. */
function cell(value: unknown): string {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function row(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function renderTable(item: JsonSchema, value: unknown): string {
  const columns = Object.entries(item.properties ?? {});
  const header = [
    row(columns.map(([name, column]) => column.title ?? name)),
    `|${columns.map(([name, column]) => "-".repeat((column.title ?? name).length + 2)).join("|")}|`,
  ];
  if (value === PLACEHOLDER) {
    return [...header, `|${columns.map(() => " ").join("|")}|`].join("\n");
  }
  const items = Array.isArray(value) ? value : [];
  const rows = items.map((entry) =>
    row(columns.map(([name]) => cell((entry as Record<string, unknown>)?.[name] ?? ""))),
  );
  return [...header, ...rows].join("\n");
}

function renderList(property: JsonSchema, value: unknown): string {
  if (value === PLACEHOLDER) {
    return Array.from({ length: EMPTY_ITEMS }, (_, index) => marker(property, index)).join("\n");
  }
  const items = Array.isArray(value) ? value : [];
  return items.map((item, index) => `${marker(property, index)} ${String(item)}`).join("\n");
}

type Defs = Record<string, JsonSchema>;

function renderMembers(schema: JsonSchema, value: unknown, label: (title: string) => string, defs: Defs): string[] {
  const instance = isRecord(value) ? value : {};
  const blocks: string[] = [];

  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const member = value === PLACEHOLDER ? PLACEHOLDER : instance[name];
    const rendered = renderProperty(property, member, defs);
    if (rendered.length === 0) continue;
    blocks.push(label(property.title ?? name), ...rendered);
  }

  return blocks;
}

function renderProperty(property: JsonSchema, value: unknown, defs: Defs): string[] {
  const blocks: string[] = [];

  if (value === PLACEHOLDER) {
    blocks.push(comment(property.description ?? ""));
    if (Array.isArray(property.enum)) blocks.push(comment(`one of: ${property.enum.join(" | ")}`));
  }

  if (property.type === "array") {
    const item = resolve(property.items, defs);
    blocks.push(item?.type === "object" ? renderTable(item, value) : renderList(property, value));
  } else if (property.type === "object") {
    blocks.push(...renderMembers(property, value, (title) => `**${title}:**`, defs));
  } else if (value !== PLACEHOLDER && value !== undefined && value !== null) {
    blocks.push(String(value));
  }

  return blocks.filter((block) => block.length > 0);
}

export interface RenderOptions {
  /** Heads the document with this instead of the schema title — one schema, several template variants. */
  heading?: string;
  /** Keep only the properties the schema requires: the MINIMAL variant of a template. */
  requiredOnly?: boolean;
  /** A lead-in comment for this variant, rendered right under the heading. */
  note?: string;
}

export function renderSchema(schema: JsonSchema, value: unknown, options: RenderOptions = {}): string {
  const kept = options.requiredOnly === true ? (schema.required ?? []) : Object.keys(schema.properties ?? {});
  const trimmed: JsonSchema = {
    ...schema,
    properties: Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([name]) => kept.includes(name))),
  };
  const blocks = [
    `## ${options.heading ?? schema.title}`,
    ...(options.note === undefined ? [] : [comment(options.note)]),
    ...renderMembers(trimmed, value, (title) => `### ${title}`, schema.$defs ?? {}),
  ];
  return `${blocks.join("\n\n")}\n`;
}
