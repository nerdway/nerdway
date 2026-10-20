import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  branchHasIssue,
  commitMessage,
  decideGate,
  gitInvocations,
  messageHasIssue,
  pushRefs,
  reminderText,
  runHook,
  type Platform,
  type Probe,
} from "./require-issue.ts";

const LINEAR: Platform = { tracker: "linear", vcs: "github", linear: { team: "DEMO", project: "x" } };
const GITHUB: Platform = { tracker: "github", vcs: "github", github: { owner: "acme", repo: "app" } };
const GITLAB: Platform = { tracker: "gitlab", vcs: "gitlab" };
const ADO: Platform = { tracker: "ado", vcs: "ado" };
const NONE: Platform = { tracker: "none", vcs: "github" };

function probe(platform: Platform | null, branch: string | null): Probe {
  return { platformFor: () => platform, branchFor: () => branch };
}

function gate(command: string, platform: Platform | null, branch: string | null, env: NodeJS.ProcessEnv = {}) {
  return decideGate(command, "/repo", env, probe(platform, branch)).decision;
}

test("Linear: the team key from the config, any letter case, anywhere in the branch", () => {
  assert.equal(branchHasIssue("demo-432-plugin-hook", LINEAR), true);
  assert.equal(branchHasIssue("DEMO-432", LINEAR), true);
  assert.equal(branchHasIssue("feature/demo-12-x", LINEAR), true);
  assert.equal(branchHasIssue("sprint-24-demo-456-fix", LINEAR), true);
});

test("Linear: another team key, a key glued to letters or a bare word is no issue ID", () => {
  assert.equal(branchHasIssue("eng-12-x", LINEAR), false);
  assert.equal(branchHasIssue("xdemo-12", LINEAR), false);
  assert.equal(branchHasIssue("main", LINEAR), false);
  assert.equal(branchHasIssue("demo-fix", LINEAR), false);
});

test("Linear without a team key accepts any letters-digits ID", () => {
  const platform: Platform = { tracker: "linear", vcs: "github" };
  assert.equal(branchHasIssue("eng-12-x", platform), true);
  assert.equal(branchHasIssue("main", platform), false);
});

test("GitHub, GitLab and Azure DevOps: the leading number of the branch", () => {
  for (const platform of [GITHUB, GITLAB, ADO]) {
    assert.equal(branchHasIssue("123-fix-login", platform), true);
    assert.equal(branchHasIssue("42", platform), true);
    assert.equal(branchHasIssue("fix-123", platform), false);
    assert.equal(branchHasIssue("main", platform), false);
  }
});

test("an issue ID in the commit message counts: KEY-123 on Linear, #123 or AB#123 elsewhere", () => {
  assert.equal(messageHasIssue("Poprawka (DEMO-432)", LINEAR), true);
  assert.equal(messageHasIssue("Poprawka", LINEAR), false);
  assert.equal(messageHasIssue("Fix login #123", GITHUB), true);
  assert.equal(messageHasIssue("Fix AB#77", ADO), true);
  assert.equal(messageHasIssue("Fix login", GITLAB), false);
});

test("gitInvocations finds commit and push only, through chains, env prefixes and git options", () => {
  assert.deepEqual(
    gitInvocations("npm test && FOO=1 git -C sub commit -m 'a b'; git push").map((item) => [item.subcommand, item.dir]),
    [
      ["commit", "sub"],
      ["push", null],
    ],
  );
  assert.deepEqual(gitInvocations("git status && git log --oneline"), []);
  assert.deepEqual(gitInvocations('echo "git commit -m x"'), []);
  assert.deepEqual(gitInvocations("git commit-tree HEAD^{tree}"), []);
  assert.deepEqual(gitInvocations("grep -r 'git push' docs"), []);
  assert.equal(gitInvocations("x=$(git commit -m y)").length, 1);
  assert.equal(gitInvocations("/usr/bin/git --no-pager -c core.editor=true commit --amend").length, 1);
});

test("commitMessage reads -m, -am, -mText and --message", () => {
  assert.equal(commitMessage(["-m", "one", "-m", "two"]), "one\ntwo");
  assert.equal(commitMessage(["-am", "all"]), "all");
  assert.equal(commitMessage(["-mglued"]), "glued");
  assert.equal(commitMessage(["--message=eq", "--message", "sp"]), "eq\nsp");
  assert.equal(commitMessage(["--amend", "--no-edit"]), "");
});

test("pushRefs takes the refspecs after the remote, both sides of a colon", () => {
  assert.deepEqual(pushRefs(["-u", "origin", "demo-1-x"]), ["demo-1-x"]);
  assert.deepEqual(pushRefs(["origin", "+HEAD:refs/heads/demo-2"]), ["HEAD", "refs/heads/demo-2"]);
  assert.deepEqual(pushRefs([]), []);
});

test("the gate denies commit and push on a branch without an issue ID", () => {
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "main"), "deny");
  assert.equal(gate("git push", LINEAR, "main"), "deny");
  assert.equal(gate("git push origin main", GITHUB, "fix-login"), "deny");
});

test("the gate allows commit and push on an issue branch", () => {
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "demo-432-hook"), "allow");
  assert.equal(gate("git push -u origin 123-fix", GITHUB, "123-fix"), "allow");
});

test("the gate allows a commit whose message names the issue and a push of an issue branch", () => {
  assert.equal(gate("git commit -m 'Poprawka (DEMO-432)'", LINEAR, "main"), "allow");
  assert.equal(gate("git push -u origin demo-432-hook", LINEAR, "main"), "allow");
  assert.equal(gate("git commit -m 'Fix #12'", GITHUB, "main"), "allow");
});

test("the gate lets through everything that is not git commit or git push", () => {
  for (const command of ["git status", "ls", "echo 'git commit'", "git commit-tree x", "node --test", ""]) {
    assert.equal(gate(command, LINEAR, "main"), "allow", command);
  }
});

test("no ## Platform section, tracker none, a detached HEAD or a failed git read allow", () => {
  assert.equal(gate("git commit -m x", null, "main"), "allow");
  assert.equal(gate("git commit -m x", NONE, "main"), "allow");
  assert.equal(gate("git commit -m x", LINEAR, ""), "allow");
  assert.equal(gate("git commit -m x", LINEAR, null), "allow");
});

test("NERD4RENT_NO_ISSUE=1 allows the gate and silences the reminder; other values do not", () => {
  assert.equal(gate("git push", LINEAR, "main", { NERD4RENT_NO_ISSUE: "1" }), "allow");
  assert.equal(gate("git push", LINEAR, "main", { NERD4RENT_NO_ISSUE: "0" }), "deny");
  assert.equal(reminderText("/repo", { NERD4RENT_NO_ISSUE: "1" }, probe(LINEAR, "main")), "");
});

test("an inline NERD4RENT_NO_ISSUE=1 prefix in the command does not open the gate", () => {
  assert.equal(gate("NERD4RENT_NO_ISSUE=1 git push", LINEAR, "main"), "deny");
});

test("the deny reason tells the model what to do and names the escape hatch", () => {
  const result = decideGate("git commit -m x", "/repo", {}, probe(LINEAR, "main"));
  assert.equal(result.decision, "deny");
  if (result.decision !== "deny") return;
  assert.match(result.agent, /git commit/);
  assert.match(result.agent, /`main`/);
  assert.match(result.agent, /demo-123-short-title/);
  assert.match(result.agent, /nerd4rent:issue-writer/);
  assert.match(result.agent, /NERD4RENT_NO_ISSUE=1/);
  assert.match(result.user, /blocked/);
});

test("the reminder appears only in a repo with a tracker on a branch without an issue ID", () => {
  assert.match(reminderText("/repo", {}, probe(LINEAR, "main")), /first step is an issue/);
  assert.equal(reminderText("/repo", {}, probe(LINEAR, "demo-1-x")), "");
  assert.equal(reminderText("/repo", {}, probe(null, "main")), "");
  assert.equal(reminderText("/repo", {}, probe(NONE, "main")), "");
});

test("runHook renders the Claude Code envelopes", () => {
  const reminder = JSON.parse(runHook("claude", "reminder", JSON.stringify({ cwd: "/repo", prompt: "hi" }), {}, "/", probe(LINEAR, "main")));
  assert.equal(reminder.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(reminder.hookSpecificOutput.additionalContext, /nerd4rent:issue-writer/);
  const deny = JSON.parse(
    runHook("claude", "gate", JSON.stringify({ cwd: "/repo", tool_name: "Bash", tool_input: { command: "git push" } }), {}, "/", probe(LINEAR, "main")),
  );
  assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
  assert.match(deny.hookSpecificOutput.permissionDecisionReason, /NERD4RENT_NO_ISSUE/);
  assert.equal(runHook("claude", "gate", JSON.stringify({ cwd: "/repo", tool_input: { command: "git status" } }), {}, "/", probe(LINEAR, "main")), "");
});

test("runHook renders the Cursor envelopes, reading workspace_roots for the reminder", () => {
  const seen: string[] = [];
  const recording: Probe = { platformFor: (dir) => (seen.push(dir), LINEAR), branchFor: () => "main" };
  const reminder = JSON.parse(runHook("cursor", "reminder", JSON.stringify({ workspace_roots: ["/ws"] }), {}, "/", recording));
  assert.deepEqual(Object.keys(reminder), ["additional_context"]);
  assert.deepEqual(seen, ["/ws"]);
  const deny = JSON.parse(runHook("cursor", "gate", JSON.stringify({ command: "git commit -m x", cwd: "/repo" }), {}, "/", probe(LINEAR, "main")));
  assert.equal(deny.permission, "deny");
  assert.match(deny.agent_message, /issue/);
  assert.deepEqual(JSON.parse(runHook("cursor", "gate", JSON.stringify({ command: "git status", cwd: "/repo" }), {}, "/", probe(LINEAR, "main"))), {
    permission: "allow",
  });
});

test("runHook fails open when the probe throws or stdin is not JSON", () => {
  const broken: Probe = {
    platformFor: () => {
      throw new Error("boom");
    },
    branchFor: () => "main",
  };
  assert.deepEqual(JSON.parse(runHook("cursor", "gate", JSON.stringify({ command: "git push" }), {}, "/", broken)), { permission: "allow" });
  assert.equal(runHook("claude", "gate", JSON.stringify({ tool_input: { command: "git push" } }), {}, "/", broken), "");
  assert.equal(runHook("claude", "reminder", "{}", {}, "/", broken), "");
  assert.deepEqual(JSON.parse(runHook("cursor", "gate", "not-json", {}, "/", probe(LINEAR, "main"))), { permission: "allow" });
});

function repo(claudeMd: string | null, branch: string): string {
  const dir = mkdtempSync(join(tmpdir(), "require-issue-"));
  execFileSync("git", ["init", "-q", "-b", branch, dir]);
  if (claudeMd !== null) writeFileSync(join(dir, "CLAUDE.md"), claudeMd);
  return dir;
}

const PLATFORM_MD = "## Platform\n\n```yaml\ntracker: linear\nvcs: github\nlinear:\n  team: DEMO\n  project: p\n```\n";

function run(runtime: string, event: string, input: unknown, env: NodeJS.ProcessEnv = {}) {
  const { NERD4RENT_NO_ISSUE: _ignored, ...base } = process.env;
  return spawnSync(process.execPath, ["hooks/require-issue.ts", "--runtime", runtime, "--event", event], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...base, ...env },
  });
}

test("the script reads a real repo: deny on main with ## Platform, allow on an issue branch or without the section", () => {
  const main = repo(PLATFORM_MD, "main");
  const cursorDeny = run("cursor", "gate", { command: "git commit -m x", cwd: main });
  assert.equal(cursorDeny.status, 0);
  assert.equal(JSON.parse(cursorDeny.stdout).permission, "deny");
  const claudeDeny = run("claude", "gate", { cwd: main, tool_input: { command: "git push" } });
  assert.equal(JSON.parse(claudeDeny.stdout).hookSpecificOutput.permissionDecision, "deny");

  const issue = repo(PLATFORM_MD, "demo-432-hook");
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git commit -m x", cwd: issue }).stdout).permission, "allow");

  const plain = repo(null, "main");
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git commit -m x", cwd: plain }).stdout).permission, "allow");
  assert.equal(run("claude", "reminder", { cwd: plain }).stdout, "");
});

test("the script honours NERD4RENT_NO_ISSUE=1 from its environment and allows outside a git repo", () => {
  const main = repo(PLATFORM_MD, "main");
  assert.equal(run("claude", "gate", { cwd: main, tool_input: { command: "git push" } }, { NERD4RENT_NO_ISSUE: "1" }).stdout, "");
  const outside = mkdtempSync(join(tmpdir(), "require-issue-nogit-"));
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git push", cwd: outside }).stdout).permission, "allow");
});

test("the script prints the reminder for Claude Code and Cursor on main", () => {
  const main = repo(PLATFORM_MD, "main");
  const claude = JSON.parse(run("claude", "reminder", { cwd: main, prompt: "zrób X" }).stdout);
  assert.equal(claude.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  const cursor = JSON.parse(run("cursor", "reminder", { workspace_roots: [main] }).stdout);
  assert.match(cursor.additional_context, /first step is an issue/);
});
