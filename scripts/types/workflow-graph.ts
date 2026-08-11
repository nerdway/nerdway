export const RUNTIMES = ["conversational", "workflow", "chain"] as const;

export type Runtime = (typeof RUNTIMES)[number];

export const GATE_KINDS = ["decision", "deny"] as const;

export const MAX_WIDTH = 16;

export interface SchemaEntry {
  id: string;
  description: string;
}

export interface Gate {
  kind: "decision" | "deny";
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function names(value: unknown): string[] {
  return isStringArray(value) ? value : [];
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
    if (typeof schema?.id !== "string") continue;
    if (registry.has(schema.id)) errors.push(`duplicate schema id in the registry: ${schema.id}`);
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

  for (const node of nodes) {
    const id = typeof node?.id === "string" ? node.id : "<missing id>";
    if (seen.has(id)) continue;
    seen.add(id);

    if (!skillDirs.includes(node.skill)) {
      errors.push(`${id}: skill ${node.skill} is not a directory under skills/`);
    }
    if (!(RUNTIMES as readonly string[]).includes(node.runtime)) {
      errors.push(`${id}: unknown runtime ${node.runtime}`);
    }
    if (names(node.dependsOn).length === 0 && node.entry !== true) {
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
