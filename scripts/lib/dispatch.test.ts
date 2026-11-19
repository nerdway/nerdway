import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildExecutorPrompt,
  decideDispatch,
  parseExecutorResult,
  type DispatchDecision,
  type DispatchInput,
  type WorkKind,
} from "./dispatch.ts";

const contract = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "workflow-graph.json"), "utf8"),
) as {
  schemas: { id: string; schema: Record<string, unknown> }[];
};

const dispatchSchema = contract.schemas.find((entry) => entry.id === "DispatchDecision")?.schema as {
  required: string[];
  properties: Record<string, { enum?: string[] }>;
  $defs: { ExecutorHandoff: { required: string[] } };
};

const WORK_KINDS: WorkKind[] = ["code", "local", "hardware", "research", "vault"];

function base(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    issue: "DEMO-1",
    phase: "in-progress",
    hasPlan: true,
    vcs: "github",
    description: "[repo=acme/app]",
    labels: [],
    workKind: "code",
    autonomousAllowed: false,
    issueUrl: "https://example.com/DEMO-1",
    planComment: "https://example.com/DEMO-1#plan",
    affectedFiles: ["scripts/lib/dispatch.ts", "scripts/lib/dispatch.test.ts"],
    ...overrides,
  };
}

function ok(input: DispatchInput): DispatchDecision {
  const result = decideDispatch(input);
  assert.equal(result.status, "ok", result.status === "blocked" ? result.reason : "");
  return result.decision;
}

function validateDecision(decision: DispatchDecision): void {
  assert.ok(dispatchSchema);
  for (const key of dispatchSchema.required) {
    assert.ok(key in decision, `missing ${key}`);
  }
  const executor = dispatchSchema.properties.executor.enum;
  const rule = dispatchSchema.properties.rule.enum;
  const mode = dispatchSchema.properties.mode.enum;
  assert.ok(executor?.includes(decision.executor));
  assert.ok(rule?.includes(decision.rule));
  assert.ok(mode?.includes(decision.mode));
  if (decision.handoff !== undefined) {
    for (const key of dispatchSchema.$defs.ExecutorHandoff.required) {
      assert.ok(key in decision.handoff, `missing handoff.${key}`);
    }
  }
}

test("refuses to dispatch before In Progress", () => {
  const todo = decideDispatch(base({ phase: "todo" }));
  assert.equal(todo.status, "blocked");
  const noPlan = decideDispatch(base({ hasPlan: false }));
  assert.equal(noPlan.status, "blocked");
});

test("research and vault work stays with the chat host", () => {
  for (const workKind of ["research", "vault"] as const) {
    const decision = ok(base({ workKind }));
    assert.equal(decision.executor, "chat-host");
    assert.equal(decision.rule, "research-or-vault");
  }
});

test("local or hardware work goes to local Claude Code, even on GitHub with a repo tag", () => {
  for (const workKind of ["local", "hardware"] as const) {
    const decision = ok(base({ workKind, vcs: "github", description: "[repo=acme/app]" }));
    assert.equal(decision.executor, "claude-code-local");
    assert.equal(decision.rule, "local-or-hardware");
  }
});

test("a GitLab project never routes to a cloud agent", () => {
  for (const vcs of ["gitlab", "ado"] as const) {
    for (const workKind of WORK_KINDS) {
      for (const description of ["[repo=acme/app]", "", undefined]) {
        const decision = ok(base({ vcs, workKind, description }));
        assert.notEqual(decision.executor, "cursor-cloud", `${vcs} ${workKind} ${String(description)}`);
      }
    }
  }
});

test("GitHub without a repo tag falls back to local", () => {
  const decision = ok(base({ description: "no tag here", labels: [] }));
  assert.equal(decision.executor, "claude-code-local");
  assert.equal(decision.rule, "no-repo-tag");
});

test("GitHub with a repo tag on the issue goes to the Cursor cloud agent", () => {
  const decision = ok(base());
  assert.equal(decision.executor, "cursor-cloud");
  assert.equal(decision.rule, "github-with-repo-tag");
  assert.equal(decision.repo, "acme/app");
  assert.ok(decision.handoff);
  assert.equal(decision.handoff?.issueUrl, "https://example.com/DEMO-1");
  assert.equal(decision.handoff?.planComment, "https://example.com/DEMO-1#plan");
  assert.deepEqual(decision.handoff?.affectedFiles, ["scripts/lib/dispatch.ts", "scripts/lib/dispatch.test.ts"]);
  assert.equal(decision.handoff?.sessionSummary, true);
});

test("a repo label counts when the description has no tag", () => {
  const fromEquals = ok(base({ description: "plain body", labels: ["repo=acme/app"] }));
  assert.equal(fromEquals.executor, "cursor-cloud");
  assert.equal(fromEquals.repo, "acme/app");
  const fromGroup = ok(base({ description: "", labels: [{ name: "acme/app", group: "repo" }] }));
  assert.equal(fromGroup.executor, "cursor-cloud");
  assert.equal(fromGroup.repo, "acme/app");
});

test("the project description is not a source of the repo", () => {
  const decision = ok(
    base({
      description: "no tag on the issue",
      labels: [],
      projectDescription: "[repo=acme/app]",
    }),
  );
  assert.equal(decision.executor, "claude-code-local");
  assert.equal(decision.rule, "no-repo-tag");
  assert.equal(decision.repo, undefined);
});

test("auto-issue-mode needs the autonomous label and the config flag", () => {
  const both = ok(base({ labels: ["autonomous"], autonomousAllowed: true }));
  assert.equal(both.mode, "auto-issue-mode");
  const labelOnly = ok(base({ labels: ["autonomous"], autonomousAllowed: false }));
  assert.equal(labelOnly.mode, "issue-workflow");
  const flagOnly = ok(base({ labels: [], autonomousAllowed: true }));
  assert.equal(flagOnly.mode, "issue-workflow");
  const neither = ok(base({ labels: [], autonomousAllowed: false }));
  assert.equal(neither.mode, "issue-workflow");
});

test("every decision validates against the DispatchDecision registry body", () => {
  const samples = [
    ok(base()),
    ok(base({ workKind: "research" })),
    ok(base({ workKind: "local" })),
    ok(base({ vcs: "gitlab" })),
    ok(base({ description: "" })),
  ];
  for (const decision of samples) validateDecision(decision);
});

test("the executor prompt names the issue, the plan, each allowed file, the session summary and the PR line, and forbids merge", () => {
  const prompt = buildExecutorPrompt(ok(base()));
  assert.match(prompt, /DEMO-1/);
  assert.match(prompt, /https:\/\/example.com\/DEMO-1#plan/);
  assert.match(prompt, /scripts\/lib\/dispatch\.ts/);
  assert.match(prompt, /scripts\/lib\/dispatch\.test\.ts/);
  assert.match(prompt, /Session summary/);
  assert.match(prompt, /draft PR URL/);
  assert.match(prompt, /Never merge/);
});

test("parseExecutorResult takes the PR URL from the last line and fails without one", () => {
  const url = "https://github.com/acme/app/pull/12";
  assert.deepEqual(parseExecutorResult(`done\n${url}\n`), { status: "ok", prUrl: url });
  assert.equal(parseExecutorResult("done, no link").status, "failed");
  assert.equal(parseExecutorResult(`${url}\nthen more text`).status, "failed");
});
