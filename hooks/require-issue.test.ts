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
  exemptBranch,
  gitInvocations,
  messageHasIssue,
  pushRefs,
  tagOnlyPush,
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

function probe(platform: Platform | null, branch: string | null, refs: string[] = []): Probe {
  return { platformFor: () => platform, branchFor: () => branch, refExists: (_dir, ref) => refs.includes(ref) };
}

function gate(command: string, platform: Platform | null, branch: string | null, env: NodeJS.ProcessEnv = {}, refs: string[] = []) {
  return decideGate(command, "/repo", env, probe(platform, branch, refs)).decision;
}

const TAGS = ["refs/tags/v1.2.3", "refs/tags/acme-app--v0.18.0", "refs/tags/both", "refs/heads/both"];
const isTag = (name: string) => TAGS.includes(`refs/tags/${name}`) && !TAGS.includes(`refs/heads/${name}`);

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

test("pushRefs skips the values of push options that take one", () => {
  assert.deepEqual(pushRefs(["-o", "ci.skip", "origin", "main"]), ["main"]);
  assert.deepEqual(pushRefs(["--push-option", "demo-5", "origin", "main"]), ["main"]);
  assert.deepEqual(pushRefs(["--receive-pack", "git-receive-pack", "origin", "x"]), ["x"]);
});

test("tagOnlyPush: refs/tags refspecs, tag <name>, --tags and names that are tags push tags only", () => {
  assert.equal(tagOnlyPush(["origin", "refs/tags/x"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "+refs/tags/x"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "refs/tags/a", "refs/tags/b"], isTag), true);
  assert.equal(tagOnlyPush(["--tags"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "--tags"], isTag), true);
  assert.equal(tagOnlyPush(["--tags", "origin", "refs/tags/x"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "v1.2.3"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "tag", "v9.9.9"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "v1.2.3:refs/tags/v1.2.3"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "v1.2.3:v1.2.3"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "HEAD:refs/tags/v2"], isTag), true);
  assert.equal(tagOnlyPush(["origin", ":refs/tags/old"], isTag), true);
  assert.equal(tagOnlyPush(["origin", "--delete", "v1.2.3"], isTag), true);
});

test("tagOnlyPush: a branch, a name that is no tag, a name that is both, the default push or --all push more than tags", () => {
  assert.equal(tagOnlyPush([], isTag), false);
  assert.equal(tagOnlyPush(["origin"], isTag), false);
  assert.equal(tagOnlyPush(["origin", "main"], isTag), false);
  assert.equal(tagOnlyPush(["origin", "v7.7.7"], isTag), false);
  assert.equal(tagOnlyPush(["origin", "both"], isTag), false);
  assert.equal(tagOnlyPush(["origin", "main", "refs/tags/x"], isTag), false);
  assert.equal(tagOnlyPush(["--tags", "origin", "main"], isTag), false);
  assert.equal(tagOnlyPush(["origin", "v1.2.3:refs/heads/main"], isTag), false);
  assert.equal(tagOnlyPush(["origin", "main:v1.2.3"], isTag), false);
  assert.equal(tagOnlyPush(["--all", "--tags", "origin"], isTag), false);
  assert.equal(tagOnlyPush(["--mirror", "origin"], isTag), false);
});

test("--follow-tags adds no tag-only meaning: the refspecs decide, the default push pushes the branch", () => {
  assert.equal(tagOnlyPush(["--follow-tags"], isTag), false);
  assert.equal(tagOnlyPush(["--follow-tags", "origin", "main"], isTag), false);
  assert.equal(tagOnlyPush(["--follow-tags", "origin", "refs/tags/x"], isTag), true);
});

test("exemptBranch: the feature/ and hotfix/ prefixes, also as refs/heads/, nothing else", () => {
  assert.equal(exemptBranch("feature/foo"), true);
  assert.equal(exemptBranch("hotfix/bar"), true);
  assert.equal(exemptBranch("refs/heads/feature/foo"), true);
  assert.equal(exemptBranch("feature"), false);
  assert.equal(exemptBranch("my-feature/foo"), false);
  assert.equal(exemptBranch("bugfix/x"), false);
  assert.equal(exemptBranch("main"), false);
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

test("the gate allows a push of tags only from main or master, whatever the branch", () => {
  for (const branch of ["main", "master", "fix-login"]) {
    assert.equal(gate("git push origin refs/tags/x", LINEAR, branch), "allow", branch);
    assert.equal(gate("git push --tags", LINEAR, branch), "allow", branch);
    assert.equal(gate("git push origin --tags", GITHUB, branch), "allow", branch);
    assert.equal(gate("git push origin v1.2.3", LINEAR, branch, {}, TAGS), "allow", branch);
    assert.equal(gate("git push origin acme-app--v0.18.0", LINEAR, branch, {}, TAGS), "allow", branch);
  }
});

test("the gate still denies a push that is not tags only from a branch without an issue ID", () => {
  assert.equal(gate("git push origin v1.2.3", LINEAR, "main"), "deny");
  assert.equal(gate("git push origin main refs/tags/x", LINEAR, "main"), "deny");
  assert.equal(gate("git push origin main v1.2.3", LINEAR, "master", {}, TAGS), "deny");
  assert.equal(gate("git push --tags origin main", LINEAR, "main"), "deny");
  assert.equal(gate("git push --follow-tags", LINEAR, "main", {}, TAGS), "deny");
  assert.equal(gate("git push --follow-tags origin master", LINEAR, "master", {}, TAGS), "deny");
  assert.equal(gate("git push origin refs/tags/x && git push", LINEAR, "main"), "deny");
});

test("the gate allows a push from feature/ and hotfix/ branches and of such a branch, and only a push", () => {
  assert.equal(gate("git push -u origin feature/foo", LINEAR, "feature/foo"), "allow");
  assert.equal(gate("git push", LINEAR, "hotfix/bar"), "allow");
  assert.equal(gate("git push --follow-tags", GITHUB, "hotfix/bar"), "allow");
  assert.equal(gate("git push -u origin feature/foo", LINEAR, "main"), "allow");
});

test("the gate allows a commit on feature/ and hotfix/ branches and still denies it on other branches without an issue ID", () => {
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "feature/foo"), "allow");
  assert.equal(gate("git commit -m 'Poprawka'", GITHUB, "hotfix/bar"), "allow");
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "bugfix/x"), "deny");
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "fix-login"), "deny");
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "main"), "deny");
  assert.equal(gate("git commit -m 'Poprawka'", LINEAR, "demo-449-tags"), "allow");
});

test("the reminder names the exemptions and stays silent on feature/ and hotfix/ branches", () => {
  const text = reminderText("/repo", {}, probe(LINEAR, "main"));
  assert.match(text, /feature\//);
  assert.match(text, /hotfix\//);
  assert.match(text, /tags only/);
  assert.equal(reminderText("/repo", {}, probe(LINEAR, "feature/foo")), "");
  assert.equal(reminderText("/repo", {}, probe(LINEAR, "hotfix/bar")), "");
});

test("the gate keeps denying other branches without an issue ID and allowing issue branches", () => {
  assert.equal(gate("git push", LINEAR, "fix-login"), "deny");
  assert.equal(gate("git push -u origin bugfix/x", LINEAR, "bugfix/x"), "deny");
  assert.equal(gate("git push", LINEAR, "demo-449-tags"), "allow");
  assert.equal(gate("git push --follow-tags", LINEAR, "demo-449-tags"), "allow");
});

test("the deny reason for a push names the tag-only way out", () => {
  const result = decideGate("git push", "/repo", {}, probe(LINEAR, "main"));
  assert.equal(result.decision, "deny");
  if (result.decision !== "deny") return;
  assert.match(result.agent, /refs\/tags\//);
  assert.match(result.agent, /feature\//);
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

test("NERDWAY_NO_ISSUE=1 allows the gate and silences the reminder; other values do not", () => {
  assert.equal(gate("git push", LINEAR, "main", { NERDWAY_NO_ISSUE: "1" }), "allow");
  assert.equal(gate("git push", LINEAR, "main", { NERDWAY_NO_ISSUE: "0" }), "deny");
  assert.equal(reminderText("/repo", { NERDWAY_NO_ISSUE: "1" }, probe(LINEAR, "main")), "");
});

test("an inline NERDWAY_NO_ISSUE=1 prefix in the command does not open the gate", () => {
  assert.equal(gate("NERDWAY_NO_ISSUE=1 git push", LINEAR, "main"), "deny");
});

test("the deny reason tells the model what to do and names the escape hatch", () => {
  const result = decideGate("git commit -m x", "/repo", {}, probe(LINEAR, "main"));
  assert.equal(result.decision, "deny");
  if (result.decision !== "deny") return;
  assert.match(result.agent, /git commit/);
  assert.match(result.agent, /`main`/);
  assert.match(result.agent, /demo-123-short-title/);
  assert.match(result.agent, /nerdway:issue-writer/);
  assert.match(result.agent, /NERDWAY_NO_ISSUE=1/);
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
  assert.match(reminder.hookSpecificOutput.additionalContext, /nerdway:issue-writer/);
  const deny = JSON.parse(
    runHook("claude", "gate", JSON.stringify({ cwd: "/repo", tool_name: "Bash", tool_input: { command: "git push" } }), {}, "/", probe(LINEAR, "main")),
  );
  assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
  assert.match(deny.hookSpecificOutput.permissionDecisionReason, /NERDWAY_NO_ISSUE/);
  assert.equal(runHook("claude", "gate", JSON.stringify({ cwd: "/repo", tool_input: { command: "git status" } }), {}, "/", probe(LINEAR, "main")), "");
});

test("runHook renders the Cursor envelopes, reading workspace_roots for the reminder", () => {
  const seen: string[] = [];
  const recording: Probe = { platformFor: (dir) => (seen.push(dir), LINEAR), branchFor: () => "main", refExists: () => false };
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
    refExists: () => false,
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
  const { NERDWAY_NO_ISSUE: _ignored, ...base } = process.env;
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

function commitAndTag(dir: string, tag: string) {
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "x"], { env });
  execFileSync("git", ["-C", dir, "tag", tag], { env });
}

test("the script reads tags from a real repo: a tag name pushes from master, a plain name is still denied", () => {
  const master = repo(PLATFORM_MD, "master");
  commitAndTag(master, "acme-app--v0.18.0");
  const tag = run("claude", "gate", { cwd: master, tool_input: { command: "git push origin acme-app--v0.18.0" } });
  assert.equal(tag.stdout, "");
  const cursorTag = run("cursor", "gate", { command: "git push origin v1.2.3", cwd: master });
  assert.equal(JSON.parse(cursorTag.stdout).permission, "deny");
  execFileSync("git", ["-C", master, "tag", "v1.2.3"]);
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git push origin v1.2.3", cwd: master }).stdout).permission, "allow");
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git push origin master v1.2.3", cwd: master }).stdout).permission, "deny");
  const feature = repo(PLATFORM_MD, "feature/foo");
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git push -u origin feature/foo", cwd: feature }).stdout).permission, "allow");
  assert.equal(JSON.parse(run("cursor", "gate", { command: "git commit -m x", cwd: feature }).stdout).permission, "allow");
  assert.equal(run("claude", "reminder", { cwd: feature }).stdout, "");
});

test("the script honours NERDWAY_NO_ISSUE=1 from its environment and allows outside a git repo", () => {
  const main = repo(PLATFORM_MD, "main");
  assert.equal(run("claude", "gate", { cwd: main, tool_input: { command: "git push" } }, { NERDWAY_NO_ISSUE: "1" }).stdout, "");
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
