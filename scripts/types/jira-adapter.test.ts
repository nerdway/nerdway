import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const adapter = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../adapters/trackers/jira.md"),
  "utf8",
);

function fences(language: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g");
  for (const match of adapter.matchAll(re)) blocks.push(match[1]);
  return blocks;
}

test("jira adapter create does not hard-code English type names", () => {
  assert.doesNotMatch(adapter, /workitem create[^\n]*--type Task/);
  assert.doesNotMatch(adapter, /workitem create[^\n]*--type Bug/);
  assert.match(adapter, /workitem create --summary "<title>" --project "<PROJECT>" --type "<TYPE>" --description /);
  assert.match(adapter, /jira\.issueType/);
  assert.match(adapter, /Please provide valid issue type\. Allowed issue types for project are:/);
});

test("jira adapter lists statuses via acli JSON and maps by statusCategory", () => {
  assert.match(adapter, /workitem search --jql "project = <PROJECT>" --fields status --limit 200 --json/);
  assert.match(adapter, /statusCategory\.key/);
  assert.match(adapter, /indeterminate/);
  assert.match(adapter, /workitem transition --key <ID> --status '<value>' --yes/);
});

test("jira adapter reads labels from JSON fields.labels, not text mode", () => {
  assert.match(adapter, /fields\.labels/);
  assert.match(adapter, /ConvertFrom-Json/);
  assert.match(adapter, /text mode does \*\*not\*\* print labels/);
  assert.match(adapter, /workitem edit --key <ID> --labels a,b --yes/);
});

test("jira adapter command table matches confirmed acli 1.3 flags", () => {
  assert.match(adapter, /workitem view <ID> --json/);
  assert.match(adapter, /workitem comment create --key <ID> --body /);
  assert.match(adapter, /workitem comment list --key <ID> --json/);
  assert.match(adapter, /workitem search --jql "project = <PROJECT> AND status in/);
  assert.match(adapter, /workitem delete --key <ID> --yes/);
});

test("jira adapter auth is any session; headless path is an unscoped token", () => {
  assert.match(adapter, /acli jira auth status/);
  assert.match(adapter, /unscoped/);
  assert.match(adapter, /oauth_global/);
  assert.doesNotMatch(adapter, /scoped to Jira/);
});

test("jira adapter PowerShell fences do not use grep or bash-only syntax", () => {
  const powershell = fences("powershell");
  assert.ok(powershell.length >= 4, `expected PowerShell recipes, got ${powershell.length}`);
  for (const block of powershell) {
    assert.doesNotMatch(block, /\bgrep\b/);
    assert.doesNotMatch(block, /\$\(cat /);
    assert.doesNotMatch(block, /\| head\b/);
    assert.doesNotMatch(block, /ConvertFrom-Json.*\|.*Select-String.*grep/);
  }
});
