import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseConfig, parseDocument, patchSection, readFrontmatter, stringify } from "./yaml.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "old-emitter");

function fixture(name: string): string {
  return readFileSync(join(fixtures, name), "utf8");
}

test("old emitter nested platform config reads identically", () => {
  const { value, errors } = parseConfig(fixture("nested-platform.yml"));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    tracker: "linear",
    vcs: "github",
    linear: { team: "DEMO", project: "72aa8034" },
    github: { owner: "nerdway", repo: "nerdway" },
    statuses: {
      strategy: "native",
      map: { backlog: "Backlog", todo: "Todo", "in-progress": "In Progress", "in-review": "In Review", done: "Done" },
    },
  });
});

test("old emitter quoted scalars read identically", () => {
  const { value, errors } = parseConfig(fixture("quoted-scalars.yml"));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { team: "No", note: "yes", board: "#1" });
});

test("old emitter booleans read identically", () => {
  const { value, errors } = parseConfig(fixture("booleans.yml"));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { tracker: "github", vcs: "github", pr: { collapse_details: false } });
});

test("old emitter wiki.path reads identically", () => {
  const { value, errors } = parseConfig(fixture("wiki-path.yml"));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { wiki: { path: "~/obsidian/nerdbrain" } });
});

test("old emitter numeric-looking strings stay strings", () => {
  const { value, errors } = parseConfig(fixture("numeric-project.yml"));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { tracker: "github", vcs: "github", github: { project: "12" } });
});

test("old emitter quoted values with spaces read identically", () => {
  const { value, errors } = parseConfig(fixture("spaces.yml"));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { ado: { project: "My Project" } });
});

test("parseDocument: comments, block scalars, flow collections, quoted strings and anchors", () => {
  const yaml = [
    "# heading",
    "note: |",
    "  hello",
    "flow: {todo: Todo, done: Done}",
    "list:",
    "  - one",
    "quoted: \"No\"",
    "plain: linear",
    "base: &team DEMO",
    "linear:",
    "  team: *team",
  ].join("\n");
  const { value, errors } = parseDocument(yaml);
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    note: "hello\n",
    flow: { todo: "Todo", done: "Done" },
    list: ["one"],
    quoted: "No",
    plain: "linear",
    base: "DEMO",
    linear: { team: "DEMO" },
  });
});

test("parseDocument: duplicate keys are errors with a line number", () => {
  const { value, errors } = parseDocument("tracker: linear\ntracker: github\n");
  assert.equal(value, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /line 2/);
  assert.match(errors[0], /unique|duplicate|Duplicated|must be unique/i);
});

test("parseDocument: an alias bomb is rejected", () => {
  const lines = ["a: &a [0]"];
  let prev = "a";
  for (let index = 0; index < 20; index += 1) {
    const name = `n${index}`;
    lines.push(`${name}: &${name} [*${prev}, *${prev}]`);
    prev = name;
  }
  const { value, errors } = parseDocument(`${lines.join("\n")}\n`);
  assert.equal(value, undefined);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /alias/i);
});

test("parseDocument: a custom tag is rejected with a line number", () => {
  const { value, errors } = parseDocument("a: !custom 1\n");
  assert.equal(value, undefined);
  assert.ok(errors.length > 0);
  assert.match(errors[0], /line 1/);
});

test("parseDocument: empty input is an empty mapping", () => {
  assert.deepEqual(parseDocument("").value, {});
  assert.deepEqual(parseDocument("# only a comment\n").value, {});
});

test("parseDocument: a sequence at the root is an error", () => {
  const { errors } = parseDocument("- a\n- b\n");
  assert.match(errors[0], /mapping/);
});

test("patchSection keeps comments and unknown sections byte-for-byte", () => {
  const text = "# keep me\nwiki:\n  path: /vault # vault\ntracker: linear\nunknown:\n  foo: bar\n";
  const patched = patchSection(text, "tracker", "github");
  assert.equal(patched, "# keep me\nwiki:\n  path: /vault # vault\ntracker: github\nunknown:\n  foo: bar\n");
});

test("patchSection on empty text writes one key", () => {
  const patched = patchSection("", "tracker", "github");
  assert.match(patched, /^tracker: github\n/);
});

test("patchSection deletes a key when the value is undefined", () => {
  const patched = patchSection("tracker: linear\nwiki:\n  path: /v\n", "tracker", undefined);
  assert.equal(patched, "wiki:\n  path: /v\n");
});

test("patchSection writes a nested extensions.id path and keeps the rest", () => {
  const text = "# keep me\nwiki:\n  path: /vault # vault\ntracker: github\nextensions:\n  other:\n    n: 1\n  demo:\n    enabled: false\n";
  const patched = patchSection(text, "extensions.demo", { enabled: true });
  assert.match(patched, /# keep me/);
  assert.match(patched, /path: \/vault # vault/);
  assert.match(patched, /tracker: github/);
  assert.match(patched, /other:\n    n: 1/);
  assert.match(patched, /demo:\n    enabled: true/);
});

test("patchSection creates extensions when the nested path is new", () => {
  const patched = patchSection("wiki:\n  path: /v\n", "extensions.demo", { enabled: true });
  assert.deepEqual(parseDocument(patched).value, { wiki: { path: "/v" }, extensions: { demo: { enabled: true } } });
});

test("patchSection deletes a nested extensions.id path", () => {
  const patched = patchSection("extensions:\n  demo:\n    enabled: true\n  other:\n    n: 1\n", "extensions.demo", undefined);
  assert.deepEqual(parseDocument(patched).value, { extensions: { other: { n: 1 } } });
});

test("stringify emits a trailing newline and nested maps", () => {
  const yaml = stringify({ tracker: "github", github: { owner: "nerdway" } });
  assert.equal(yaml.endsWith("\n"), true);
  assert.deepEqual(parseDocument(yaml).value, { tracker: "github", github: { owner: "nerdway" } });
});

test("readFrontmatter reads plain, quoted and folded block values", () => {
  const { fields, body, error } = readFrontmatter(
    '---\nname: issue-start\nmodel: "haiku"\ndescription: >-\n  first line\n  second line\nskills:\n  - nerdbrain-search\n---\nbody\n',
  );
  assert.equal(error, undefined);
  assert.equal(fields.name, "issue-start");
  assert.equal(fields.model, "haiku");
  assert.equal(fields.description, "first line second line");
  assert.deepEqual(fields.skills, ["nerdbrain-search"]);
  assert.equal(body, "body\n");
});

test("readFrontmatter reports a file without frontmatter", () => {
  assert.match(readFrontmatter("# no frontmatter\n").error ?? "", /no YAML frontmatter/);
  assert.match(readFrontmatter("---\nname: x\n").error ?? "", /not closed/);
});
