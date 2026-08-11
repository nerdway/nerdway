export const RUNTIMES = ["conversational", "workflow", "chain"] as const;

export type Runtime = (typeof RUNTIMES)[number];

export const GATE_KINDS = ["decision", "deny"] as const;

export const MAX_WIDTH = 16;

export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  $defs?: Record<string, JsonSchema>;
  $ref?: string;
  "x-render"?: string;
}

export interface SchemaEntry {
  id: string;
  description: string;
  schema: JsonSchema;
}

export interface Gate {
  kind: (typeof GATE_KINDS)[number];
  mechanism: string;
  description: string;
}

export interface FailurePolicy {
  retries: number;
  fallback: string;
  killsRun: boolean;
  reporting: string;
}

export interface GraphNode {
  id: string;
  skill: string;
  runtime: Runtime;
  phase: string;
  in: string[];
  out: string[];
  dependsOn: string[];
  failure: FailurePolicy;
  budget: { maxWidth: number };
  gates: Gate[];
  entry?: boolean;
  irreversible?: boolean;
}

export interface GraphContract {
  schemas: SchemaEntry[];
  nodes: GraphNode[];
}

export interface InlineSchemaUse {
  script: string;
  schema: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function names(value: unknown): string[] {
  return isStringArray(value) ? value : [];
}

function validateProperties(id: string, path: string, raw: unknown, errors: string[]): void {
  if (!isRecord(raw)) return;
  for (const [name, property] of Object.entries(raw)) {
    const where = `${path}.${name}`;
    if (!isRecord(property)) {
      errors.push(`schema ${id}: property ${where} must be a schema object`);
      continue;
    }
    for (const field of ["title", "description"] as const) {
      const value = property[field];
      if (typeof value !== "string" || value.length === 0) {
        errors.push(`schema ${id}: property ${where} must have a non-empty ${field} — the renderer builds the template from it`);
      }
    }
    validateProperties(id, `${where}.items`, (property.items as JsonSchema | undefined)?.properties, errors);
    validateProperties(id, where, property.properties, errors);
  }
}

const LOCAL_REF = "#/$defs/";

function validateRefs(id: string, node: unknown, defs: Set<string>, errors: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) validateRefs(id, item, defs, errors);
    return;
  }
  if (!isRecord(node)) return;
  const ref = node.$ref;
  if (typeof ref === "string") {
    if (!ref.startsWith(LOCAL_REF)) {
      errors.push(`schema ${id}: $ref ${ref} leaves the document — a registry entry is inlined verbatim, so it must be self-contained`);
    } else if (!defs.has(ref.slice(LOCAL_REF.length))) {
      errors.push(`schema ${id}: $ref ${ref} names no entry in this document's $defs`);
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref") continue;
    validateRefs(id, value, defs, errors);
  }
}

function validateSchemaBody(id: string, raw: unknown, errors: string[]): void {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`schema ${id}: schema body is required — the JSON Schema the edge payload is checked against`);
    return;
  }
  const body = raw as JsonSchema;
  if (body.type !== "object") {
    errors.push(`schema ${id}: schema body must declare type "object" — an edge carries a record, not a bare value`);
  }
  if (typeof body.title !== "string" || body.title.length === 0) {
    errors.push(`schema ${id}: schema body must have a non-empty title — the renderer heads the section with it`);
  }

  const properties = body.properties;
  if (!isRecord(properties) || Object.keys(properties).length === 0) {
    errors.push(`schema ${id}: schema body must declare at least one property in properties`);
    return;
  }

  validateRefs(id, body, new Set(isRecord(body.$defs) ? Object.keys(body.$defs) : []), errors);
  validateProperties(id, "properties", properties, errors);
  if (isRecord(body.$defs)) {
    for (const [name, def] of Object.entries(body.$defs)) {
      validateProperties(id, `$defs.${name}`, (def as JsonSchema)?.properties, errors);
    }
  }

  if (body.required !== undefined) {
    if (!isStringArray(body.required)) {
      errors.push(`schema ${id}: required must be an array of property names`);
    } else {
      for (const name of body.required) {
        if (!(name in properties)) {
          errors.push(`schema ${id}: required names ${name}, which is not among its properties`);
        }
      }
    }
  }
}

function validateFailure(id: string, raw: unknown, errors: string[]): void {
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${id}: failure policy is required`);
    return;
  }
  const f = raw as Record<string, unknown>;
  if (typeof f.retries !== "number") errors.push(`${id}: failure.retries must be a number`);
  if (typeof f.fallback !== "string") errors.push(`${id}: failure.fallback must describe what happens instead`);
  if (typeof f.killsRun !== "boolean") errors.push(`${id}: failure.killsRun must be a boolean`);
  if (typeof f.reporting !== "string") errors.push(`${id}: failure.reporting must name where the failure surfaces`);
}

function validateGates(id: string, runtime: unknown, raw: unknown, errors: string[]): void {
  if (!Array.isArray(raw)) {
    errors.push(`${id}: gates must be an array`);
    return;
  }
  for (const gate of raw as Gate[]) {
    if (!(GATE_KINDS as readonly string[]).includes(gate?.kind)) {
      errors.push(`${id}: unknown gate kind ${gate?.kind}`);
      continue;
    }
    if (typeof gate.mechanism !== "string" || gate.mechanism.length === 0) {
      errors.push(`${id}: gate ${gate.kind} must name the mechanism that enforces it`);
    }
    if (typeof gate.description !== "string" || gate.description.length === 0) {
      errors.push(`${id}: gate ${gate.kind} must describe what it holds back`);
    }
    if (gate.kind === "decision" && runtime === "workflow") {
      errors.push(`${id}: a decision gate cannot sit inside a workflow node — the runtime takes no mid-run user input`);
    }
  }
}

function validateBudget(id: string, raw: unknown, errors: string[]): void {
  const maxWidth = (raw as { maxWidth?: unknown })?.maxWidth;
  if (typeof maxWidth !== "number" || !Number.isInteger(maxWidth) || maxWidth < 1 || maxWidth > MAX_WIDTH) {
    errors.push(`${id}: budget.maxWidth must be an integer between 1 and ${MAX_WIDTH}`);
  }
}

function findCycle(nodes: GraphNode[], byId: Map<string, GraphNode>): string | undefined {
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];

  function walk(id: string): string | undefined {
    if (state.get(id) === "done") return undefined;
    if (state.get(id) === "open") return `cycle detected: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`;
    state.set(id, "open");
    stack.push(id);
    for (const dependency of names(byId.get(id)?.dependsOn)) {
      if (!byId.has(dependency)) continue;
      const cycle = walk(dependency);
      if (cycle !== undefined) return cycle;
    }
    stack.pop();
    state.set(id, "done");
    return undefined;
  }

  for (const node of nodes) {
    if (typeof node?.id !== "string") continue;
    const cycle = walk(node.id);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
}

export function validateContract(raw: unknown, skillDirs: string[], inlineSchemas: InlineSchemaUse[] = []): string[] {
  if (typeof raw !== "object" || raw === null) return ["contract must be an object with schemas and nodes arrays"];
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.schemas) || !Array.isArray(c.nodes)) {
    return ["contract must be an object with schemas and nodes arrays"];
  }

  const errors: string[] = [];
  const registry = new Set<string>();
  for (const schema of c.schemas as SchemaEntry[]) {
    if (typeof schema !== "object" || schema === null || typeof schema.id !== "string") {
      errors.push("each schemas entry must be an object with a string id");
      continue;
    }
    if (registry.has(schema.id)) errors.push(`duplicate schema id in the registry: ${schema.id}`);
    if (typeof schema.description !== "string" || schema.description.length === 0) {
      errors.push(`schema ${schema.id}: description must say what travels on the edge`);
    }
    validateSchemaBody(schema.id, schema.schema, errors);
    registry.add(schema.id);
  }

  const nodes = c.nodes as GraphNode[];
  const byId = new Map<string, GraphNode>();
  const seen = new Set<string>();
  for (const node of nodes) {
    if (typeof node?.id !== "string") continue;
    if (byId.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    byId.set(node.id, node);
  }

  let entries = 0;
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) {
      errors.push("each nodes entry must be an object");
      continue;
    }
    const id = typeof node.id === "string" ? node.id : "<missing id>";
    if (seen.has(id)) continue;
    seen.add(id);

    if (typeof node.id !== "string" || node.id.length === 0) {
      errors.push("node is missing a string id");
    }
    if (node.entry === true && ++entries > 1) {
      errors.push(`${id}: a second node is marked as the axis entry`);
    }
    for (const field of ["in", "out", "dependsOn"] as const) {
      if (!isStringArray(node[field])) errors.push(`${id}: ${field} must be an array of strings`);
    }
    if (!skillDirs.includes(node.skill)) {
      errors.push(`${id}: skill ${node.skill} is not a directory under skills/`);
    }
    if (!(RUNTIMES as readonly string[]).includes(node.runtime)) {
      errors.push(`${id}: unknown runtime ${node.runtime}`);
    }
    if (isStringArray(node.dependsOn) && node.dependsOn.length === 0 && node.entry !== true) {
      errors.push(`${id}: orphaned node — no dependsOn and not marked as the axis entry`);
    }
    if (node.irreversible === true && (!Array.isArray(node.gates) || node.gates.length === 0)) {
      errors.push(`${id}: irreversible action must sit behind a gate`);
    }
    validateFailure(id, node.failure, errors);
    validateGates(id, node.runtime, node.gates, errors);
    validateBudget(id, node.budget, errors);
    for (const schema of [...names(node.in), ...names(node.out)]) {
      if (!registry.has(schema)) errors.push(`${id}: schema ${schema} is not in the schema registry`);
    }
    for (const dependency of names(node.dependsOn)) {
      const upstream = byId.get(dependency);
      if (upstream === undefined) {
        errors.push(`${id}: dependsOn names ${dependency}, which is not a node id`);
        continue;
      }
      const shared = names(upstream.out).filter((schema) => names(node.in).includes(schema));
      if (shared.length === 0) {
        errors.push(`edge ${dependency} -> ${id} carries no declared schema: ${dependency}.out and ${id}.in do not overlap`);
      }
    }
  }

  const cycle = findCycle(nodes, byId);
  if (cycle !== undefined) errors.push(cycle);

  for (const use of inlineSchemas) {
    if (!registry.has(use.schema)) {
      errors.push(`${use.script}: inlines schema ${use.schema}, which drifted from the contract registry`);
    }
  }

  return errors;
}
