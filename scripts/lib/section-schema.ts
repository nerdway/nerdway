export const SCHEMA_TYPES = ["object", "array", "string", "number", "integer", "boolean"] as const;

export type SchemaType = (typeof SCHEMA_TYPES)[number];

const ALLOWED_KEYWORDS = [
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "default",
  "description",
] as const;

export type SectionSchema = {
  type?: SchemaType;
  properties?: Record<string, SectionSchema>;
  required?: string[];
  additionalProperties?: boolean | SectionSchema;
  items?: SectionSchema;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  description?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(path: string, key: string): string {
  return path.length === 0 ? key : `${path}.${key}`;
}

function schemaAt(path: string): string {
  return path.length === 0 ? "schema" : path;
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;
  if (typeof left !== "object") return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function matchesType(value: unknown, type: SchemaType): boolean {
  switch (type) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
  }
}

function expectedType(schema: SectionSchema): SchemaType | undefined {
  return schema.type;
}

export function unsupportedSchemaKeywords(schema: unknown, path = ""): string[] {
  if (!isRecord(schema)) return [`${schemaAt(path)}: schema must be an object`];
  const errors: string[] = [];
  for (const key of Object.keys(schema)) {
    if (!(ALLOWED_KEYWORDS as readonly string[]).includes(key)) {
      errors.push(`${schemaAt(path)}: unsupported keyword ${key}`);
    }
  }
  if (schema.type !== undefined) {
    if (typeof schema.type !== "string" || !(SCHEMA_TYPES as readonly string[]).includes(schema.type)) {
      errors.push(`${schemaAt(path)}: unsupported type ${JSON.stringify(schema.type)}`);
    }
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      errors.push(`${schemaAt(path)}: properties must be an object`);
    } else {
      for (const [key, nested] of Object.entries(schema.properties)) {
        errors.push(...unsupportedSchemaKeywords(nested, joinPath(path, key)));
      }
    }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string")) {
      errors.push(`${schemaAt(path)}: required must be an array of strings`);
    }
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== true && schema.additionalProperties !== false) {
    errors.push(...unsupportedSchemaKeywords(schema.additionalProperties, joinPath(path, "additionalProperties")));
  }
  if (schema.items !== undefined) {
    if (Array.isArray(schema.items)) {
      errors.push(`${schemaAt(path)}: tuple items are unsupported`);
    } else {
      errors.push(...unsupportedSchemaKeywords(schema.items, joinPath(path, "items")));
    }
  }
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    errors.push(`${schemaAt(path)}: enum must be an array`);
  }
  if (schema.minimum !== undefined && typeof schema.minimum !== "number") {
    errors.push(`${schemaAt(path)}: minimum must be a number`);
  }
  if (schema.maximum !== undefined && typeof schema.maximum !== "number") {
    errors.push(`${schemaAt(path)}: maximum must be a number`);
  }
  if (schema.minLength !== undefined && (!Number.isInteger(schema.minLength) || schema.minLength < 0)) {
    errors.push(`${schemaAt(path)}: minLength must be a non-negative integer`);
  }
  if (schema.maxLength !== undefined && (!Number.isInteger(schema.maxLength) || schema.maxLength < 0)) {
    errors.push(`${schemaAt(path)}: maxLength must be a non-negative integer`);
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string") {
      errors.push(`${schemaAt(path)}: pattern must be a string`);
    } else {
      try {
        new RegExp(schema.pattern);
      } catch {
        errors.push(`${schemaAt(path)}: pattern is not a valid regular expression`);
      }
    }
  }
  if (schema.description !== undefined && typeof schema.description !== "string") {
    errors.push(`${schemaAt(path)}: description must be a string`);
  }
  return errors;
}

function cloneDefault(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function applyDefaults(value: unknown, schema: SectionSchema): unknown {
  let next = value;
  if (next === undefined && schema.default !== undefined) next = cloneDefault(schema.default);
  const properties = schema.properties;
  if (properties !== undefined) {
    if (!isRecord(next)) return next;
    const object: Record<string, unknown> = { ...next };
    for (const [key, nested] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) {
        object[key] = applyDefaults(object[key], nested);
      } else {
        const filled = applyDefaults(undefined, nested);
        if (filled !== undefined) object[key] = filled;
      }
    }
    return object;
  }
  if (schema.items !== undefined && Array.isArray(next)) {
    return next.map((item) => applyDefaults(item, schema.items as SectionSchema));
  }
  return next;
}

export function validateAgainstSchema(value: unknown, schema: SectionSchema, path: string): string[] {
  const errors: string[] = [];
  const type = expectedType(schema);
  if (type !== undefined && !matchesType(value, type)) {
    errors.push(`${path}: expected ${type}`);
    return errors;
  }
  if (schema.const !== undefined && !equal(value, schema.const)) {
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.some((item) => equal(item, value))) {
    errors.push(`${path}: expected one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: must be <= ${schema.maximum}`);
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: length must be >= ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: length must be <= ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
  }
  if (schema.items !== undefined && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateAgainstSchema(item, schema.items as SectionSchema, joinPath(path, String(index))));
    });
  }
  if (isRecord(value) && (schema.properties !== undefined || schema.required !== undefined || schema.additionalProperties !== undefined)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${joinPath(path, key)}: required`);
    }
    for (const [key, nested] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      errors.push(...validateAgainstSchema(value[key], nested, joinPath(path, key)));
    }
    const additional = schema.additionalProperties;
    if (additional !== undefined && additional !== true) {
      for (const key of Object.keys(value)) {
        if (Object.hasOwn(properties, key)) continue;
        if (additional === false) {
          errors.push(`${joinPath(path, key)}: unexpected property`);
        } else {
          errors.push(...validateAgainstSchema(value[key], additional, joinPath(path, key)));
        }
      }
    }
  }
  return errors;
}
