import { parseRepoTag, repoFromLabels, type RepoLabel } from "./repo-tag.ts";

export type WorkKind = "code" | "local" | "hardware" | "research" | "vault";

export type Executor = "cursor-cloud" | "claude-code-local" | "chat-host";

export type DispatchRule =
  | "research-or-vault"
  | "local-or-hardware"
  | "non-github-forge"
  | "no-repo-tag"
  | "github-with-repo-tag";

export type DispatchMode = "issue-workflow" | "auto-issue-mode";

export type ExecutorHandoff = {
  issueUrl: string;
  planComment: string;
  affectedFiles: string[];
  sessionSummary: true;
  returns: string;
};

export type DispatchDecision = {
  issue: string;
  executor: Executor;
  rule: DispatchRule;
  repo?: string;
  mode: DispatchMode;
  handoff?: ExecutorHandoff;
};

export type DispatchInput = {
  issue: string;
  phase: string;
  hasPlan: boolean;
  vcs: string;
  description?: string;
  labels?: readonly RepoLabel[];
  workKind: WorkKind;
  autonomousAllowed: boolean;
  issueUrl?: string;
  planComment?: string;
  affectedFiles?: string[];
  projectDescription?: string;
};

export type DispatchResult =
  | { status: "blocked"; reason: string }
  | { status: "ok"; decision: DispatchDecision };

const HANDOFF_RETURNS = "The draft PR URL as the last line of the final message.";

function labelNames(labels: readonly RepoLabel[] | undefined): string[] {
  if (labels === undefined) return [];
  return labels.map((label) => (typeof label === "string" ? label : label.name));
}

function repoOf(input: DispatchInput): string | undefined {
  return parseRepoTag(input.description ?? "") ?? repoFromLabels(input.labels ?? []);
}

function modeOf(input: DispatchInput): DispatchMode {
  return labelNames(input.labels).includes("autonomous") && input.autonomousAllowed === true
    ? "auto-issue-mode"
    : "issue-workflow";
}

function handoffOf(input: DispatchInput): ExecutorHandoff {
  return {
    issueUrl: input.issueUrl ?? "",
    planComment: input.planComment ?? "",
    affectedFiles: [...(input.affectedFiles ?? [])],
    sessionSummary: true,
    returns: HANDOFF_RETURNS,
  };
}

function decided(
  input: DispatchInput,
  executor: Executor,
  rule: DispatchRule,
  extras: { repo?: string; handoff?: ExecutorHandoff } = {},
): DispatchResult {
  const decision: DispatchDecision = {
    issue: input.issue,
    executor,
    rule,
    mode: modeOf(input),
  };
  if (extras.repo !== undefined) decision.repo = extras.repo;
  if (extras.handoff !== undefined) decision.handoff = extras.handoff;
  return { status: "ok", decision };
}

export function decideDispatch(input: DispatchInput): DispatchResult {
  if (input.phase !== "in-progress") {
    return { status: "blocked", reason: "the issue is not In Progress" };
  }
  if (input.hasPlan !== true) {
    return { status: "blocked", reason: "the plan comment is missing" };
  }

  if (input.workKind === "research" || input.workKind === "vault") {
    return decided(input, "chat-host", "research-or-vault", { repo: repoOf(input) });
  }
  if (input.workKind === "local" || input.workKind === "hardware") {
    return decided(input, "claude-code-local", "local-or-hardware", { repo: repoOf(input) });
  }
  if (input.vcs !== "github") {
    return decided(input, "claude-code-local", "non-github-forge", { repo: repoOf(input) });
  }

  const repo = repoOf(input);
  if (repo === undefined) {
    return decided(input, "claude-code-local", "no-repo-tag");
  }
  return decided(input, "cursor-cloud", "github-with-repo-tag", { repo, handoff: handoffOf(input) });
}

const EXECUTOR_PROMPT = `You are the cloud executor for nerdway issue {{issue}} in {{repo}}.

Inputs:
- Repository: {{repo}}
- Issue: {{issue}} ({{issueUrl}})
- Plan comment: {{planComment}}
- Allowed files:
{{files}}
- Base branch: the repository default branch

Duties, in order:
1. Run nerdway:issue-workflow on the issue in Implementation (Start if branch and PR are missing).
2. Change only the allowed files.
3. Run the repo's tests and validators.
4. Post a ## Session summary comment on the issue.
5. Leave the PR as a draft or ready for review. Never merge, never set Done, never change another issue.

Output: the final message ends with the draft PR URL on its own line.
`;

export function buildExecutorPrompt(decision: DispatchDecision): string {
  if (decision.executor !== "cursor-cloud" || decision.handoff === undefined) {
    throw new Error("the executor prompt is only for a cursor-cloud decision");
  }
  const files = decision.handoff.affectedFiles.map((file) => `- ${file}`).join("\n");
  return EXECUTOR_PROMPT.replaceAll("{{issue}}", decision.issue)
    .replaceAll("{{repo}}", decision.repo ?? "")
    .replaceAll("{{issueUrl}}", decision.handoff.issueUrl)
    .replaceAll("{{planComment}}", decision.handoff.planComment)
    .replaceAll("{{files}}", files.length > 0 ? files : "- (none)");
}

export type ExecutorParse =
  | { status: "ok"; prUrl: string }
  | { status: "failed"; reason: string };

const PR_URL = /^https?:\/\/\S+$/;
const PR_PATH = /\/(pull|merge_requests)\//;

export function parseExecutorResult(text: string): ExecutorParse {
  const lines = text.replace(/\s+$/, "").split(/\r?\n/);
  const last = lines.at(-1)?.trim() ?? "";
  if (PR_URL.test(last) && PR_PATH.test(last)) return { status: "ok", prUrl: last };
  return { status: "failed", reason: "the final message has no draft PR URL on its last line" };
}
