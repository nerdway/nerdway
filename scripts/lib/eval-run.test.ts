import { test } from "node:test";
import assert from "node:assert/strict";

import { claudeArgs, parseRunArgs } from "./eval-run.ts";

test("with no arguments every skill runs and nothing is passed through", () => {
  assert.deepEqual(parseRunArgs([]), { skills: [], dryRun: false, keepCases: false, help: false, passthrough: [] });
});

test("--skill filters the skills, repeated or comma-separated", () => {
  const parsed = parseRunArgs(["--skill", "issue-start", "--skill=issue-close,issue-workflow"]);
  assert.deepEqual("skills" in parsed && parsed.skills, ["issue-start", "issue-close", "issue-workflow"]);
});

test("the runner's own flags are not passed through, everything else is", () => {
  const parsed = parseRunArgs(["--runs", "1", "--dry-run", "--no-publish", "--keep-cases", "--max-cost-usd", "5"]);
  assert.deepEqual(parsed, {
    skills: [],
    dryRun: true,
    keepCases: true,
    help: false,
    passthrough: ["--runs", "1", "--no-publish", "--max-cost-usd", "5"],
  });
});

test("--skill without a value is an error", () => {
  assert.deepEqual(parseRunArgs(["--skill"]), { error: "--skill needs a skill name" });
});

test("granting Bash or an MCP tool is refused", () => {
  for (const argv of [
    ["--allow-tools", "Bash"],
    ["--allow-tools", "Write", "Bash(git status:*)"],
    ["--allow-tools=mcp__plugin_x__*"],
    ["--allow-tools", "mcp__linear__save_issue"],
  ]) {
    const parsed = parseRunArgs(argv);
    assert.ok("error" in parsed, argv.join(" "));
    assert.match(parsed.error, /Bash or MCP/);
  }
});

test("other tool grants are passed through", () => {
  const parsed = parseRunArgs(["--allow-tools", "Write", "Edit", "--runs", "1"]);
  assert.deepEqual("passthrough" in parsed && parsed.passthrough, ["--allow-tools", "Write", "Edit", "--runs", "1"]);
});

test("real MCP servers, scaffold scripts and a foreign eval dir are refused", () => {
  for (const argv of [["--allow-real-servers"], ["--mocks", "off"], ["--mocks=off"], ["--scaffold"], ["--eval-dir", "x"], ["--eval-dir=x"]]) {
    assert.ok("error" in parseRunArgs(argv), argv.join(" "));
  }
  assert.ok("passthrough" in parseRunArgs(["--mocks", "record"]));
});

test("the claude command targets the plugin root with the generated eval dir and a results dir", () => {
  assert.deepEqual(claudeArgs({ root: "/repo", evalDir: "eval-cases/s1", outputDir: "/repo/results/s1", passthrough: ["--runs", "1"] }), [
    "plugin",
    "eval",
    "/repo",
    "--eval-dir",
    "eval-cases/s1",
    "--output-dir",
    "/repo/results/s1",
    "--runs",
    "1",
  ]);
});

test("an --output-dir the caller passes wins over the default results dir", () => {
  const args = claudeArgs({ root: "/repo", evalDir: "eval-cases/s1", outputDir: "/repo/results/s1", passthrough: ["--output-dir", "/elsewhere"] });
  assert.deepEqual(args, ["plugin", "eval", "/repo", "--eval-dir", "eval-cases/s1", "--output-dir", "/elsewhere"]);
});
