import assert from "node:assert/strict";
import { test } from "node:test";

import { applyDefaults, unsupportedSchemaKeywords, validateAgainstSchema, type SectionSchema } from "./section-schema.ts";

test("type: object, array, string, number, integer, boolean", () => {
  assert.deepEqual(validateAgainstSchema({ a: 1 }, { type: "object" }, "root"), []);
  assert.deepEqual(validateAgainstSchema([1], { type: "array" }, "root"), []);
  assert.deepEqual(validateAgainstSchema("x", { type: "string" }, "root"), []);
  assert.deepEqual(validateAgainstSchema(1.5, { type: "number" }, "root"), []);
  assert.deepEqual(validateAgainstSchema(2, { type: "integer" }, "root"), []);
  assert.deepEqual(validateAgainstSchema(true, { type: "boolean" }, "root"), []);
  assert.deepEqual(validateAgainstSchema("x", { type: "boolean" }, "extensions.foo.bar"), [
    "extensions.foo.bar: expected boolean",
  ]);
  assert.deepEqual(validateAgainstSchema(1.5, { type: "integer" }, "n"), ["n: expected integer"]);
  assert.deepEqual(validateAgainstSchema([], { type: "object" }, "wiki"), ["wiki: expected object"]);
  assert.deepEqual(validateAgainstSchema(null, { type: "object" }, "pr"), ["pr: expected object"]);
});

test("properties, required and additionalProperties", () => {
  const schema: SectionSchema = {
    type: "object",
    properties: { path: { type: "string" }, extra: { type: "boolean" } },
    required: ["path"],
    additionalProperties: false,
  };
  assert.deepEqual(validateAgainstSchema({ path: "/v" }, schema, "wiki"), []);
  assert.deepEqual(validateAgainstSchema({}, schema, "wiki"), ["wiki.path: required"]);
  assert.deepEqual(validateAgainstSchema({ path: 1 }, schema, "wiki"), ["wiki.path: expected string"]);
  assert.deepEqual(validateAgainstSchema({ path: "/v", unknown: 1 }, schema, "wiki"), ["wiki.unknown: unexpected property"]);
});

test("additionalProperties as a nested schema", () => {
  const schema: SectionSchema = {
    type: "object",
    additionalProperties: { type: "boolean" },
  };
  assert.deepEqual(validateAgainstSchema({ a: true, b: false }, schema, "ext"), []);
  assert.deepEqual(validateAgainstSchema({ a: 1 }, schema, "ext"), ["ext.a: expected boolean"]);
});

test("items validates every array element", () => {
  const schema: SectionSchema = { type: "array", items: { type: "string" } };
  assert.deepEqual(validateAgainstSchema(["a", "b"], schema, "list"), []);
  assert.deepEqual(validateAgainstSchema(["a", 1], schema, "list"), ["list.1: expected string"]);
});

test("enum and const", () => {
  assert.deepEqual(validateAgainstSchema("github", { enum: ["github", "gitlab"] }, "vcs"), []);
  assert.deepEqual(validateAgainstSchema("ado", { enum: ["github", "gitlab"] }, "vcs"), [
    'vcs: expected one of "github", "gitlab"',
  ]);
  assert.deepEqual(validateAgainstSchema("ready", { const: "ready" }, "state"), []);
  assert.deepEqual(validateAgainstSchema("other", { const: "ready" }, "state"), ['state: expected "ready"']);
});

test("minimum, maximum, minLength, maxLength, pattern", () => {
  assert.deepEqual(validateAgainstSchema(5, { type: "number", minimum: 1, maximum: 5 }, "n"), []);
  assert.deepEqual(validateAgainstSchema(0, { type: "number", minimum: 1 }, "n"), ["n: must be >= 1"]);
  assert.deepEqual(validateAgainstSchema(6, { type: "number", maximum: 5 }, "n"), ["n: must be <= 5"]);
  assert.deepEqual(validateAgainstSchema("ab", { type: "string", minLength: 2, maxLength: 4 }, "s"), []);
  assert.deepEqual(validateAgainstSchema("a", { type: "string", minLength: 2 }, "s"), ["s: length must be >= 2"]);
  assert.deepEqual(validateAgainstSchema("abcde", { type: "string", maxLength: 4 }, "s"), ["s: length must be <= 4"]);
  assert.deepEqual(validateAgainstSchema("demo", { type: "string", pattern: "^[a-z]+$" }, "id"), []);
  assert.deepEqual(validateAgainstSchema("Demo", { type: "string", pattern: "^[a-z]+$" }, "id"), [
    "id: does not match pattern ^[a-z]+$",
  ]);
});

test("applyDefaults fills missing properties and nested defaults", () => {
  const schema: SectionSchema = {
    type: "object",
    properties: {
      collapse_details: { type: "boolean", default: true },
      nested: {
        type: "object",
        properties: { n: { type: "number", default: 3 } },
        default: {},
      },
    },
  };
  assert.deepEqual(applyDefaults({}, schema), { collapse_details: true, nested: { n: 3 } });
  assert.deepEqual(applyDefaults({ collapse_details: false }, schema), { collapse_details: false, nested: { n: 3 } });
  assert.deepEqual(applyDefaults(undefined, { default: { a: 1 } }), { a: 1 });
});

test("unsupported keywords are rejected, including nested ones", () => {
  assert.match(unsupportedSchemaKeywords({ oneOf: [] }).join("\n"), /unsupported keyword oneOf/);
  assert.match(unsupportedSchemaKeywords({ $ref: "#/defs/x" }).join("\n"), /unsupported keyword \$ref/);
  assert.match(unsupportedSchemaKeywords({ format: "email" }).join("\n"), /unsupported keyword format/);
  assert.match(unsupportedSchemaKeywords({ uniqueItems: true }).join("\n"), /unsupported keyword uniqueItems/);
  assert.match(
    unsupportedSchemaKeywords({ type: "object", properties: { a: { anyOf: [] } } }).join("\n"),
    /a: unsupported keyword anyOf/,
  );
  assert.match(unsupportedSchemaKeywords({ type: ["string", "null"] }).join("\n"), /unsupported type/);
  assert.match(unsupportedSchemaKeywords({ items: [{ type: "string" }] }).join("\n"), /tuple items are unsupported/);
  assert.deepEqual(unsupportedSchemaKeywords({ type: "object", properties: { path: { type: "string" } } }), []);
});

test("description is allowed and does not affect validation", () => {
  const schema: SectionSchema = { type: "boolean", description: "on or off" };
  assert.deepEqual(unsupportedSchemaKeywords(schema), []);
  assert.deepEqual(validateAgainstSchema(true, schema, "flag"), []);
});
