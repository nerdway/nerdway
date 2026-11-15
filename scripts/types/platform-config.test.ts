import assert from "node:assert/strict";
import { test } from "node:test";

import { parseConfig, parseDocument } from "../lib/yaml.ts";
import { validateKnownSections } from "../lib/config-sections.ts";
import {
  platformYaml,
  prCollapseDetails,
  readPlatform,
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

function sectionErrors(raw: Record<string, unknown>, source = adapter()): string[] {
  return validateKnownSections(raw, { vocabulary, trackerAdapter: source }).errors;
}

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

test("accepts wiki.path as a string", () => {
  assert.deepEqual(sectionErrors({ ...config(), wiki: { path: "~/vault" } }), []);
});

test("rejects a non-string wiki.path", () => {
  const errors = sectionErrors({ ...config(), wiki: { path: { nested: "x" } } });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /wiki\.path: expected string/);
});

test("rejects wiki as a scalar", () => {
  const errors = sectionErrors({ ...config(), wiki: "/tmp/wiki" });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /wiki: expected object/);
});

test("accepts an explicit native map", () => {
  assert.deepEqual(validatePlatformConfig(config({ strategy: "native", map: nativeMap }), vocabulary, adapter()), []);
});

test("accepts a comment map of marker values", () => {
  const map = { backlog: "backlog", todo: "todo", "in-progress": "in-progress", "in-review": "in-review", done: "done" };
  assert.deepEqual(validatePlatformConfig(config({ strategy: "comment", map }), vocabulary, adapter()), []);
});

test("rejects a tracker or vcs outside the enum", () => {
  const errors = validatePlatformConfig({ tracker: "basecamp", vcs: "bitbucket" }, vocabulary, undefined);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /basecamp/);
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

test("a __proto__ key does not pollute Object.prototype", () => {
  const { value, errors } = parseDocument("map:\n  __proto__:\n    backlog: Backlog");
  assert.deepEqual(errors, []);
  assert.equal((value as { polluted?: unknown } | undefined)?.polluted, undefined);
  assert.equal(Object.getPrototypeOf(value ?? {}).polluted, undefined);
});

test("platformYaml: reads a CRLF file", () => {
  const markdown = "## Platform\r\n\r\n```yaml\r\ntracker: linear\r\nvcs: github\r\n```\r\n";
  const { yaml, errors } = platformYaml(markdown);
  assert.deepEqual(errors, []);
  assert.deepEqual(parseConfig(yaml ?? "").value, { tracker: "linear", vcs: "github" });
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

const adoVocabulary: PlatformVocabulary = { ...vocabulary, trackers: [...vocabulary.trackers, "ado"], vcs: [...vocabulary.vcs, "ado"] };
const adoDefaults = ["strategy: native", "map:", "  backlog: New", "  todo: Todo", "  in-progress: Active", "  in-review: In Review", "  done: Closed"].join("\n");
const adoAdapter = adapter([["native", "read", "write"], ["label", "read", "write"], ["comment", "read", "write"]], adoDefaults);
const adoColumns = { backlog: "New", todo: "Todo", "in-progress": "Active", "in-review": "In Review", done: "Closed" };

function adoConfig(ado: Record<string, string>, statuses?: unknown) {
  return { tracker: "ado", vcs: "ado", ado: { org: "acme", project: "Shop", ...ado }, ...(statuses === undefined ? {} : { statuses }) };
}

test("ado: accepts native columns with the team and board named", () => {
  const ado = { team: "Shop Team", board: "Stories", workItemType: "User Story" };
  assert.deepEqual(validatePlatformConfig(adoConfig(ado, { strategy: "native", map: adoColumns }), adoVocabulary, adoAdapter), []);
});

test("ado: rejects native columns without the team and board that own them", () => {
  const errors = validatePlatformConfig(adoConfig({}, { strategy: "native", map: adoColumns }), adoVocabulary, adoAdapter);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /ado\.team/);
  assert.match(errors[1], /ado\.board/);
});

test("ado: the adapter default native strategy needs the board too", () => {
  const errors = validatePlatformConfig(adoConfig({ team: "Shop Team" }), adoVocabulary, adoAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ado\.board/);
});

test("ado: label and comment need no board", () => {
  assert.deepEqual(validatePlatformConfig(adoConfig({}, { strategy: "label", map: labelMap }), adoVocabulary, adoAdapter), []);
});

test("ado: rejects a team, board or work item type carrying shell quoting characters", () => {
  const errors = validatePlatformConfig(adoConfig({ team: 'Shop "A"', board: "Stories", workItemType: "$(id)" }, { strategy: "native", map: adoColumns }), adoVocabulary, adoAdapter);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /ado\.team/);
  assert.match(errors[1], /ado\.workItemType/);
});

const jiraVocabulary: PlatformVocabulary = { ...vocabulary, trackers: [...vocabulary.trackers, "jira"] };
const jiraDefaults = ["strategy: native", "map:", "  backlog: Backlog", "  todo: To Do", "  in-progress: In Progress", "  in-review: In Review", "  done: Done"].join("\n");
const jiraAdapter = adapter([["native", "read", "write"], ["label", "—", "—"], ["comment", "read", "write"]], jiraDefaults);

function jiraConfig(jira: Record<string, string>, statuses?: unknown) {
  return { tracker: "jira", vcs: "github", jira: { site: "acme.atlassian.net", project: "PROJ", ...jira }, github: { owner: "acme", repo: "app" }, ...(statuses === undefined ? {} : { statuses }) };
}

test("jira: accepts site and project with the adapter default native map", () => {
  assert.deepEqual(validatePlatformConfig(jiraConfig({}), jiraVocabulary, jiraAdapter), []);
});

test("jira: rejects a config without site or project", () => {
  const errors = validatePlatformConfig({ tracker: "jira", vcs: "github" }, jiraVocabulary, jiraAdapter);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /jira\.site/);
  assert.match(errors[1], /jira\.project/);
});

test("jira: rejects a site or project carrying shell quoting characters", () => {
  const errors = validatePlatformConfig(jiraConfig({ site: 'acme".atlassian.net', project: "$(id)" }), jiraVocabulary, jiraAdapter);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /jira\.site/);
  assert.match(errors[1], /jira\.project/);
});

test("jira: accepts an explicit comment map as the no-admin fallback", () => {
  const map = { backlog: "backlog", todo: "todo", "in-progress": "in-progress", "in-review": "in-review", done: "done" };
  assert.deepEqual(validatePlatformConfig(jiraConfig({}, { strategy: "comment", map }), jiraVocabulary, jiraAdapter), []);
});

test("jira: rejects label, which the adapter does not support", () => {
  const errors = validatePlatformConfig(jiraConfig({}, { strategy: "label", map: labelMap }), jiraVocabulary, jiraAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not supported/);
});

test("jira: accepts an optional issueType", () => {
  assert.deepEqual(validatePlatformConfig(jiraConfig({ issueType: "Story" }), jiraVocabulary, jiraAdapter), []);
});

test("jira: rejects an issueType carrying shell quoting characters", () => {
  const errors = validatePlatformConfig(jiraConfig({ issueType: "Task$(id)" }), jiraVocabulary, jiraAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /jira\.issueType/);
});

const githubVocabulary: PlatformVocabulary = { ...vocabulary };
const githubDefaults = ["strategy: label", "map:", "  backlog: open", "  todo: status::todo", "  in-progress: status::in-progress", "  in-review: status::in-review", "  done: closed"].join("\n");
const githubAdapter = adapter([["native", "read", "write"], ["label", "read", "write"], ["comment", "read", "write"]], githubDefaults);
const githubNativeMap = { backlog: "Backlog", todo: "Todo", "in-progress": "In Progress", "in-review": "In Review", done: "Done" };

function githubConfig(github: Record<string, string>, statuses?: unknown) {
  return { tracker: "github", vcs: "github", github: { owner: "acme", repo: "app", ...github }, ...(statuses === undefined ? {} : { statuses }) };
}

test("github: native requires github.project", () => {
  const errors = validatePlatformConfig(githubConfig({}, { strategy: "native", map: githubNativeMap }), githubVocabulary, githubAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /github\.project/);
});

test("github: native accepts a project number", () => {
  assert.deepEqual(
    validatePlatformConfig(githubConfig({ project: "1" }, { strategy: "native", map: githubNativeMap }), githubVocabulary, githubAdapter),
    [],
  );
});

test("github: label stays valid without a project, which is the default", () => {
  assert.deepEqual(validatePlatformConfig(githubConfig({}, { strategy: "label", map: labelMap }), githubVocabulary, githubAdapter), []);
  assert.deepEqual(validatePlatformConfig(githubConfig({}), githubVocabulary, githubAdapter), []);
});

test("github: comment needs no project", () => {
  const map = { backlog: "backlog", todo: "todo", "in-progress": "in-progress", "in-review": "in-review", done: "done" };
  assert.deepEqual(validatePlatformConfig(githubConfig({}, { strategy: "comment", map }), githubVocabulary, githubAdapter), []);
});

test("github: rejects a project carrying shell quoting characters", () => {
  const errors = validatePlatformConfig(githubConfig({ project: "$(id)" }, { strategy: "native", map: githubNativeMap }), githubVocabulary, githubAdapter);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /github\.project/);
});

test("readPlatform: a valid section is found, with the parsed object", () => {
  const markdown = "# Repo\n\n## Platform\n\n```yaml\ntracker: linear\nvcs: github\nlinear:\n  team: DEMO\n```\n\n## Other\n";
  assert.deepEqual(readPlatform(markdown, vocabulary, new Map([["linear", adapter()]])), {
    status: "found",
    value: { tracker: "linear", vcs: "github", linear: { team: "DEMO" } },
    errors: [],
    notices: [],
  });
});

test("readPlatform: no file or no line-start section is absent, so the caller moves to its next source", () => {
  assert.equal(readPlatform(undefined, vocabulary, new Map()).status, "absent");
  assert.equal(readPlatform("# Repo\n\nProse naming ## Platform inline.\n", vocabulary, new Map()).status, "absent");
  assert.equal(readPlatform("## Platform and adapters\n\n```yaml\ntracker: linear\n```\n", vocabulary, new Map()).status, "absent");
});

test("readPlatform: a broken section is invalid, never absent, so the caller stops instead of guessing", () => {
  const noBlock = readPlatform("## Platform\n\nprose only\n", vocabulary, new Map());
  assert.equal(noBlock.status, "invalid");
  assert.match(noBlock.errors[0], /yaml/);
  const badValue = readPlatform("## Platform\n\n```yaml\ntracker: basecamp\nvcs: github\n```\n", vocabulary, new Map());
  assert.equal(badValue.status, "invalid");
  assert.match(badValue.errors[0], /basecamp/);
});

test("pr.collapse_details: absent is valid and defaults to true", () => {
  assert.deepEqual(sectionErrors(config()), []);
  assert.equal(prCollapseDetails(config()), true);
  assert.equal(prCollapseDetails({ ...config(), pr: {} }), true);
});

test("pr.collapse_details: accepts true and false", () => {
  assert.deepEqual(sectionErrors({ ...config(), pr: { collapse_details: true } }), []);
  assert.deepEqual(sectionErrors({ ...config(), pr: { collapse_details: false } }), []);
  assert.equal(prCollapseDetails({ ...config(), pr: { collapse_details: true } }), true);
  assert.equal(prCollapseDetails({ ...config(), pr: { collapse_details: false } }), false);
});

test("pr.collapse_details: rejects a non-boolean with a clear error", () => {
  for (const value of ["true", "false", "yes", 1, { nested: true }]) {
    const errors = sectionErrors({ ...config(), pr: { collapse_details: value } });
    assert.equal(errors.length, 1, JSON.stringify(value));
    assert.match(errors[0], /pr\.collapse_details: expected boolean/);
  }
  const notObject = sectionErrors({ ...config(), pr: "true" });
  assert.equal(notObject.length, 1);
  assert.match(notObject[0], /pr: expected object/);
});
