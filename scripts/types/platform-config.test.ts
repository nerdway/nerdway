import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseYaml,
  platformYaml,
  supportedStrategies,
  validateAdapterDefaults,
  validatePlatformConfig,
  type PlatformVocabulary,
} from "./platform-config.ts";

const vocabulary: PlatformVocabulary = {
  trackers: ["linear", "github", "none"],
  vcs: ["github", "gitlab"],
  strategies: ["native", "label", "comment"],
  phases: ["backlog", "todo", "in-progress", "in-review", "done"],
};

function adapter(rows: string[][] = [["native", "read", "write"], ["label", "—", "—"], ["comment", "read", "write"]], defaults = linearDefaults) {
  return [
    "## Statuses",
    "",
    "prose",
    "",
    "```yaml",
    defaults,
    "```",
    "",
    "## Status strategies",
    "",
    "| Strategy | Read | Write |",
    "|---|---|---|",
    ...rows.map((row) => `| \`${row[0]}\` | ${row[1]} | ${row[2]} |`),
  ].join("\n");
}

const linearDefaults = ["strategy: native", "map:", "  backlog: Backlog", "  todo: Todo", "  in-progress: In Progress", "  in-review: In Review", "  done: Done"].join("\n");

const nativeMap = { backlog: "Backlog", todo: "Todo", "in-progress": "In Progress", "in-review": "In Review", done: "Done" };

function config(statuses?: unknown) {
  return { tracker: "linear", vcs: "github", linear: { team: "DEMO", project: "uuid" }, ...(statuses === undefined ? {} : { statuses }) };
}

test("parseYaml: reads the nested platform config shape as strings", () => {
  const yaml = ["tracker: linear", "vcs: github", "linear:", "  team: DEMO", "  project: 72aa8034", "statuses:", "  strategy: label", "  map:", "    todo: status::todo", '    done: "closed"'].join("\n");
  const { value, errors } = parseYaml(yaml);
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    tracker: "linear",
    vcs: "github",
    linear: { team: "DEMO", project: "72aa8034" },
    statuses: { strategy: "label", map: { todo: "status::todo", done: "closed" } },
  });
});

test("parseYaml: keeps a value with spaces and skips blank and comment lines", () => {
  const { value, errors } = parseYaml("# platform\n\nado:\n  project: 'My Project'\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { ado: { project: "My Project" } });
});

test("parseYaml: reports a list instead of guessing", () => {
  const { errors } = parseYaml("tracker: linear\nlabels:\n  - a\n");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /line 3/);
});

test("parseYaml: reports flow collections and block scalars", () => {
  assert.equal(parseYaml("map: {todo: Todo}").errors.length, 1);
  assert.match(parseYaml("note: |\n  text").errors[0], /line 1/);
});

test("parseYaml: reports a duplicate key", () => {
  const { errors } = parseYaml("tracker: linear\ntracker: github");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /tracker/);
});

test("platformYaml: takes the yaml block of the line-start ## Platform section only", () => {
  const markdown = ["# Repo", "", "Prose naming ## Platform inline.", "", "## Platform", "", "```yaml", "tracker: linear", "```", "", "## Other", "", "```yaml", "tracker: github", "```"].join("\n");
  assert.deepEqual(platformYaml(markdown), { yaml: "tracker: linear", errors: [] });
});

test("platformYaml: reports a missing section", () => {
  const { yaml, errors } = platformYaml("# Repo\n\nNo platform here.");
  assert.equal(yaml, undefined);
  assert.match(errors[0], /## Platform/);
});

test("platformYaml: reports a section without exactly one yaml block", () => {
  assert.match(platformYaml("## Platform\n\nprose").errors[0], /yaml/);
  assert.match(platformYaml("## Platform\n\n```yaml\na: b\n```\n\n```yaml\nc: d\n```").errors[0], /yaml/);
});

test("supportedStrategies: lists the strategies with recipes, skipping —", () => {
  assert.deepEqual(supportedStrategies(adapter()), ["native", "comment"]);
});

test("accepts a config without statuses: the adapter default applies", () => {
  assert.deepEqual(validatePlatformConfig(config(), vocabulary, adapter()), []);
});

test("accepts an explicit native map", () => {
  assert.deepEqual(validatePlatformConfig(config({ strategy: "native", map: nativeMap }), vocabulary, adapter()), []);
});

test("accepts a comment map of marker values", () => {
  const map = { backlog: "backlog", todo: "todo", "in-progress": "in-progress", "in-review": "in-review", done: "done" };
  assert.deepEqual(validatePlatformConfig(config({ strategy: "comment", map }), vocabulary, adapter()), []);
});

test("rejects a tracker or vcs outside the enum", () => {
  const errors = validatePlatformConfig({ tracker: "jira", vcs: "bitbucket" }, vocabulary, undefined);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /jira/);
  assert.match(errors[1], /bitbucket/);
});

test("rejects a map missing a phase", () => {
  const { done: _done, ...map } = nativeMap;
  const errors = validatePlatformConfig(config({ strategy: "native", map }), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /done/);
});

test("rejects a map key that is not a phase", () => {
  const errors = validatePlatformConfig(config({ strategy: "native", map: { ...nativeMap, canceled: "Canceled" } }), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /canceled/);
});

test("rejects an unknown strategy", () => {
  const errors = validatePlatformConfig(config({ strategy: "field", map: nativeMap }), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /field/);
});

test("rejects a strategy the adapter lists as —", () => {
  const map = { ...nativeMap, backlog: "open", done: "closed" };
  const errors = validatePlatformConfig(config({ strategy: "label", map }), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not supported/);
});

test("rejects a value mapped to two phases", () => {
  const errors = validatePlatformConfig(config({ strategy: "native", map: { ...nativeMap, todo: "Backlog" } }), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Backlog/);
});

test("rejects open or closed outside the label strategy", () => {
  const errors = validatePlatformConfig(config({ strategy: "comment", map: { ...nativeMap, done: "closed" } }), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /closed/);
});

const labelAdapter = adapter([["native", "—", "—"], ["label", "read", "write"], ["comment", "read", "write"]]);
const labelMap = { backlog: "open", todo: "status::todo", "in-progress": "status::in-progress", "in-review": "status::in-review", done: "closed" };

test("accepts a label map with open for backlog and closed for done", () => {
  assert.deepEqual(validatePlatformConfig(config({ strategy: "label", map: labelMap }), vocabulary, labelAdapter), []);
});

test("accepts a label map with a label for backlog", () => {
  const map = { ...labelMap, backlog: "status::backlog" };
  assert.deepEqual(validatePlatformConfig(config({ strategy: "label", map }), vocabulary, labelAdapter), []);
});

test("rejects a label map whose done is not closed", () => {
  const errors = validatePlatformConfig(config({ strategy: "label", map: { ...labelMap, done: "status::done" } }), vocabulary, labelAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /done/);
});

test("rejects a label map using open for a phase other than backlog", () => {
  const errors = validatePlatformConfig(config({ strategy: "label", map: { ...labelMap, backlog: "status::backlog", todo: "open" } }), vocabulary, labelAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /open/);
});

test("rejects statuses on a project without a tracker", () => {
  const errors = validatePlatformConfig({ tracker: "none", vcs: "github", statuses: { strategy: "native", map: nativeMap } }, vocabulary, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /none/);
});

test("rejects statuses when the tracker adapter is not available to check them against", () => {
  const errors = validatePlatformConfig({ tracker: "github", vcs: "github", statuses: { strategy: "label", map: labelMap } }, vocabulary, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /adapter/);
});

test("rejects statuses that are not an object with strategy and map", () => {
  const errors = validatePlatformConfig(config("native"), vocabulary, adapter());
  assert.equal(errors.length, 1);
  assert.match(errors[0], /statuses/);
});

test("validateAdapterDefaults: accepts a valid default block", () => {
  assert.deepEqual(validateAdapterDefaults("linear", adapter(), vocabulary), []);
});

test("validateAdapterDefaults: rejects a default strategy the adapter does not support", () => {
  const source = adapter([["native", "—", "—"], ["label", "—", "—"], ["comment", "read", "write"]]);
  const errors = validateAdapterDefaults("linear", source, vocabulary);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /trackers\/linear/);
});

test("validateAdapterDefaults: rejects a Statuses section with no yaml block", () => {
  const errors = validateAdapterDefaults("linear", "## Statuses\n\nprose\n\n## Status strategies\n\n| a | b | c |\n|---|---|---|\n| `native` | r | w |", vocabulary);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /yaml/);
});

test("parseYaml: rejects a __proto__ key instead of swapping the prototype", () => {
  const { value, errors } = parseYaml("map:\n  __proto__:\n    backlog: Backlog");
  assert.equal(value, undefined);
  assert.match(errors[0], /__proto__/);
});

test("parseYaml: strips a trailing comment from plain and quoted values", () => {
  const { value, errors } = parseYaml("tracker: linear # main\nmap:\n  todo: 'Todo' # planned");
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { tracker: "linear", map: { todo: "Todo" } });
});

test("parseYaml: rejects a sibling indented deeper than the first key of its map", () => {
  assert.match(parseYaml("tracker: linear\n  vcs: github").errors[0], /line 2/);
});

test("parseYaml: rejects a dedent to an indentation no enclosing map uses", () => {
  assert.match(parseYaml("a:\n    b: one\n  c: two").errors[0], /line 3/);
});

test("platformYaml: reads a CRLF file", () => {
  const markdown = "## Platform\r\n\r\n```yaml\r\ntracker: linear\r\nvcs: github\r\n```\r\n";
  const { yaml, errors } = platformYaml(markdown);
  assert.deepEqual(errors, []);
  assert.deepEqual(parseYaml(yaml ?? "").value, { tracker: "linear", vcs: "github" });
});

test("rejects a map value carrying shell quoting or expansion characters", () => {
  for (const value of ["x'; touch pwned; echo '", 'In "Review"', "$(id)", "`id`", "a\\b"]) {
    const errors = validatePlatformConfig(config({ strategy: "native", map: { ...nativeMap, "in-review": value } }), vocabulary, adapter());
    assert.equal(errors.length, 1, value);
    assert.match(errors[0], /in-review/);
  }
});

test("an unknown strategy does not also report reserved values against it", () => {
  const errors = validatePlatformConfig(config({ strategy: "labels", map: labelMap }), vocabulary, labelAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /labels/);
});

test("supportedStrategies: a row with empty or missing recipe cells is not supported", () => {
  const source = adapter([["native", "", ""], ["label", "—", "—"], ["comment", "read", "write"]]).concat("\n| `label` |");
  assert.deepEqual(supportedStrategies(source), ["comment"]);
});
