import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface SkillEval {
  id: string;
  prompt: string;
  expected_output: string;
  files: string[];
  assertions: string[];
}

export interface SkillEvalsFile {
  skill_name: string;
  evals: SkillEval[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateEvalCase(raw: unknown, position: number, errors: string[]): string | undefined {
  if (!isRecord(raw)) {
    errors.push(`eval #${position} must be an object`);
    return undefined;
  }
  const id = typeof raw.id === "string" ? raw.id : undefined;
  const label = id !== undefined && id.trim() ? `eval '${id}'` : `eval #${position}`;

  if (id === undefined) {
    errors.push(`${label}: id must be a string`);
  } else if (!id.trim()) {
    errors.push("each eval must have an id");
  }
  if (typeof raw.prompt !== "string") {
    errors.push(`${label}: prompt must be a string`);
  } else if (!raw.prompt.trim()) {
    errors.push(`${label} must have a prompt`);
  }
  if (typeof raw.expected_output !== "string") {
    errors.push(`${label}: expected_output must be a string`);
  }
  if (!isStringArray(raw.files)) {
    errors.push(`${label}: files must be an array of strings`);
  }
  if (!isStringArray(raw.assertions)) {
    errors.push(`${label}: assertions must be an array of strings`);
  } else if (raw.assertions.length === 0) {
    errors.push(`${label} must have assertions`);
  }
  return id !== undefined && id.trim() ? id : undefined;
}

export function validateEvalsFile(data: unknown, skillDir?: string): string[] {
  const errors: string[] = [];
  if (!isRecord(data)) return ["the evals file must be a JSON object"];

  if (typeof data.skill_name !== "string") {
    errors.push("skill_name must be a string");
  } else if (!data.skill_name.trim()) {
    errors.push("skill_name must be non-empty");
  } else if (skillDir !== undefined && data.skill_name !== skillDir) {
    errors.push(`skill_name '${data.skill_name}' does not match the skill directory '${skillDir}'`);
  }

  if (!Array.isArray(data.evals)) {
    errors.push("evals must be an array of eval cases");
    return errors;
  }
  if (data.evals.length === 0) {
    errors.push("evals must contain at least one case");
  }

  const seen = new Set<string>();
  const repeated = new Set<string>();
  data.evals.forEach((raw, index) => {
    const id = validateEvalCase(raw, index + 1, errors);
    if (id === undefined) return;
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  });
  for (const id of repeated) errors.push(`eval id '${id}' is used more than once`);

  return errors;
}

export interface ReadEvalsResult {
  file: SkillEvalsFile | undefined;
  errors: string[];
}

export function readEvalsFile(path: string): ReadEvalsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return { file: undefined, errors: [`the evals file is not valid JSON: ${(error as Error).message}`] };
  }
  const errors = validateEvalsFile(raw, basename(dirname(dirname(path))));
  return { file: errors.length === 0 ? (raw as SkillEvalsFile) : undefined, errors };
}

export function findEvalsFiles(repoRoot: string): string[] {
  const skillsDir = join(repoRoot, "skills");
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDir, entry.name, "evals", "evals.json"))
    .filter((path) => existsSync(path))
    .sort();
}
