import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderAllow, renderDeny } from "../scripts/lib/hook-decision.ts";
import { renderContextOutput, type Runtime } from "../scripts/lib/install-check.ts";
import { readPlatformFile } from "../scripts/lib/platform-read.ts";

export type Platform = Record<string, unknown>;

export interface GitInvocation {
  subcommand: "commit" | "push";
  args: string[];
  dir: string | null;
}

export interface Probe {
  platformFor: (dir: string) => Platform | null;
  branchFor: (dir: string) => string | null;
  refExists: (dir: string, ref: string) => boolean;
}

export type GateDecision = { decision: "allow" } | { decision: "deny"; agent: string; user: string };

const OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env"]);
const SEPARATORS = new Set([";", "&", "|", "\n", "(", ")", "`"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PUSH_OPTIONS_WITH_VALUE = new Set(["-o", "--push-option", "--receive-pack", "--exec", "--repo"]);
const PUSH_BEYOND_REFSPECS = new Set(["--all", "--branches", "--mirror"]);
export const EXEMPT_BRANCH_PREFIXES = ["feature/", "hotfix/"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trackerOf(platform: Platform): string {
  return typeof platform.tracker === "string" ? platform.tracker : "none";
}

function linearKey(platform: Platform): string {
  const linear = platform.linear;
  const team = isRecord(linear) ? linear.team : undefined;
  return typeof team === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(team) ? escapeRegExp(team) : "[a-z][a-z0-9_]*";
}

export function enforced(platform: Platform | null): platform is Platform {
  return platform !== null && trackerOf(platform) !== "none";
}

export function branchHasIssue(branch: string, platform: Platform): boolean {
  if (trackerOf(platform) === "linear") {
    return new RegExp(`(?<![a-z0-9])${linearKey(platform)}-[0-9]+(?![0-9])`, "i").test(branch);
  }
  return /^[0-9]+(?![0-9])/.test(branch);
}

export function messageHasIssue(message: string, platform: Platform): boolean {
  if (trackerOf(platform) === "linear") return branchHasIssue(message, platform);
  return /(?<![A-Za-z0-9])(?:AB)?#[0-9]+/.test(message);
}

export function example(platform: Platform): string {
  if (trackerOf(platform) === "linear") {
    const linear = platform.linear;
    const team = isRecord(linear) && typeof linear.team === "string" ? linear.team : "TEAM";
    return `${team.toLowerCase()}-123-short-title`;
  }
  return "123-short-title";
}

export function shellSegments(command: string): string[][] {
  const segments: string[][] = [];
  let tokens: string[] = [];
  let token = "";
  let started = false;
  let quote: "'" | '"' | null = null;
  const endToken = () => {
    if (started) tokens.push(token);
    token = "";
    started = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && index + 1 < command.length) {
        index += 1;
        token += command[index];
      } else token += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\" && index + 1 < command.length) {
      index += 1;
      if (command[index] !== "\n") {
        token += command[index];
        started = true;
      }
    } else if (char === "$" && command[index + 1] === "(") {
      endSegment();
      index += 1;
    } else if (SEPARATORS.has(char)) {
      endSegment();
    } else if (char === " " || char === "\t" || char === "\r") {
      endToken();
    } else {
      token += char;
      started = true;
    }
  }
  endSegment();
  return segments;
}

export function gitInvocations(command: string): GitInvocation[] {
  const found: GitInvocation[] = [];
  for (const segment of shellSegments(command)) {
    let index = 0;
    while (index < segment.length && ASSIGNMENT.test(segment[index])) index += 1;
    const program = segment[index] ?? "";
    if (program !== "git" && !program.endsWith("/git")) continue;
    index += 1;
    let dir: string | null = null;
    while (index < segment.length && segment[index].startsWith("-")) {
      const option = segment[index];
      if (OPTIONS_WITH_VALUE.has(option)) {
        if (option === "-C") dir = dir === null ? segment[index + 1] ?? null : resolve(dir, segment[index + 1] ?? ".");
        index += 2;
      } else index += 1;
    }
    const subcommand = segment[index];
    if (subcommand === "commit" || subcommand === "push") {
      found.push({ subcommand, args: segment.slice(index + 1), dir });
    }
  }
  return found;
}

export function commitMessage(args: string[]): string {
  const parts: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") break;
    if (arg === "--message" || arg === "-m") {
      parts.push(args[index + 1] ?? "");
      index += 1;
    } else if (arg.startsWith("--message=")) {
      parts.push(arg.slice("--message=".length));
    } else if (/^-[A-Za-z]+$/.test(arg) && arg.includes("m")) {
      const at = arg.indexOf("m");
      if (at === arg.length - 1) {
        parts.push(args[index + 1] ?? "");
        index += 1;
      } else parts.push(arg.slice(at + 1));
    } else if (/^-m./.test(arg)) {
      parts.push(arg.slice(2));
    }
  }
  return parts.join("\n");
}

interface PushArgs {
  flags: string[];
  refspecs: string[];
}

function pushArgs(args: string[]): PushArgs {
  const flags: string[] = [];
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("-")) {
      flags.push(arg);
      if (PUSH_OPTIONS_WITH_VALUE.has(arg)) index += 1;
    } else positional.push(arg);
  }
  return { flags, refspecs: positional.slice(1) };
}

export function pushRefs(args: string[]): string[] {
  return pushArgs(args).refspecs.flatMap((refspec) => refspec.replace(/^\+/, "").split(":"));
}

function isTagSide(name: string, isTag: (name: string) => boolean): boolean {
  if (name.startsWith("refs/tags/")) return name.length > "refs/tags/".length;
  return !name.startsWith("refs/") && name !== "HEAD" && name.length > 0 && isTag(name);
}

function refspecIsTag(refspec: string, isTag: (name: string) => boolean): boolean {
  const spec = refspec.replace(/^\+/, "");
  const colon = spec.indexOf(":");
  if (colon === -1) return isTagSide(spec, isTag);
  const src = spec.slice(0, colon);
  const dst = spec.slice(colon + 1);
  if (dst.startsWith("refs/")) return isTagSide(dst, isTag);
  if (src.length === 0) return isTagSide(dst, isTag);
  return dst.length > 0 && isTagSide(src, isTag);
}

export function tagOnlyPush(args: string[], isTag: (name: string) => boolean): boolean {
  const { flags, refspecs } = pushArgs(args);
  if (flags.some((flag) => PUSH_BEYOND_REFSPECS.has(flag))) return false;
  const specs: string[] = [];
  for (let index = 0; index < refspecs.length; index += 1) {
    if (refspecs[index] === "tag" && index + 1 < refspecs.length) {
      specs.push(`refs/tags/${refspecs[index + 1]}`);
      index += 1;
    } else specs.push(refspecs[index]);
  }
  if (!specs.every((spec) => refspecIsTag(spec, isTag))) return false;
  return specs.length > 0 || flags.includes("--tags");
}

export function exemptBranch(branch: string): boolean {
  const name = branch.startsWith("refs/heads/") ? branch.slice("refs/heads/".length) : branch;
  return EXEMPT_BRANCH_PREFIXES.some((prefix) => name.startsWith(prefix) && name.length > prefix.length);
}

export function noIssueOverride(env: NodeJS.ProcessEnv): boolean {
  return env.NERD4RENT_NO_ISSUE === "1";
}

function denyMessages(invocation: GitInvocation, branch: string, platform: Platform): { agent: string; user: string } {
  const tracker = trackerOf(platform);
  const agent =
    `nerd4rent blocked git ${invocation.subcommand}: this repository tracks work in ${tracker} (## Platform in CLAUDE.md) ` +
    `and the branch \`${branch}\` carries no issue ID (expected a name like \`${example(platform)}\`). ` +
    "Every change needs an issue first: find or create it (nerd4rent:issue-writer), tell the user its number, " +
    "then work on its branch (nerd4rent:issue-start) and commit there. " +
    "Do not rename the branch to a made-up ID. If the user explicitly wants this change without an issue, " +
    "ask them to set NERD4RENT_NO_ISSUE=1 in the environment the agent runs in and restart the session." +
    (invocation.subcommand === "push"
      ? " A push of tags only always passes (git push origin refs/tags/<tag>, git push origin <tag>, git push --tags), " +
        `and so does a push from a branch starting with ${EXEMPT_BRANCH_PREFIXES.map((prefix) => `\`${prefix}\``).join(" or ")}; ` +
        "--follow-tags pushes the branch as well, so it is judged by the branch."
      : "");
  const user = `nerd4rent: git ${invocation.subcommand} blocked, branch ${branch} has no ${tracker} issue ID (NERD4RENT_NO_ISSUE=1 turns the check off).`;
  return { agent, user };
}

export function decideGate(command: string, cwd: string, env: NodeJS.ProcessEnv, probe: Probe): GateDecision {
  if (noIssueOverride(env)) return { decision: "allow" };
  for (const invocation of gitInvocations(command)) {
    const dir = invocation.dir === null ? cwd : resolve(cwd, invocation.dir);
    const platform = probe.platformFor(dir);
    if (!enforced(platform)) continue;
    const branch = probe.branchFor(dir);
    if (branch === null || branch.length === 0) continue;
    if (branchHasIssue(branch, platform)) continue;
    if (invocation.subcommand === "commit" && messageHasIssue(commitMessage(invocation.args), platform)) continue;
    if (invocation.subcommand === "push") {
      const isTag = (name: string) => probe.refExists(dir, `refs/tags/${name}`) && !probe.refExists(dir, `refs/heads/${name}`);
      if (tagOnlyPush(invocation.args, isTag)) continue;
      if (exemptBranch(branch)) continue;
      const refs = pushRefs(invocation.args);
      if (refs.some((ref) => branchHasIssue(ref, platform) || exemptBranch(ref))) continue;
    }
    return { decision: "deny", ...denyMessages(invocation, branch, platform) };
  }
  return { decision: "allow" };
}

export function reminderText(dir: string, env: NodeJS.ProcessEnv, probe: Probe): string {
  if (noIssueOverride(env)) return "";
  const platform = probe.platformFor(dir);
  if (!enforced(platform)) return "";
  const branch = probe.branchFor(dir);
  if (branch === null || branch.length === 0 || branchHasIssue(branch, platform)) return "";
  return (
    `nerd4rent: this repository tracks work in ${trackerOf(platform)} (## Platform in CLAUDE.md) and the current branch ` +
    `\`${branch}\` carries no issue ID. If the user's request will change the repository, the first step is an issue ` +
    "in the tracker: find or create it (nerd4rent:issue-writer) and tell the user its number before you start, " +
    "then work on its branch (nerd4rent:issue-start). Questions, analysis and reading code need no issue. " +
    "git commit and git push are blocked on a branch without an issue ID unless NERD4RENT_NO_ISSUE=1 is set."
  );
}

export function readInput(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function commandOf(input: Record<string, unknown>): string {
  if (typeof input.command === "string") return input.command;
  const toolInput = input.tool_input;
  if (isRecord(toolInput) && typeof toolInput.command === "string") return toolInput.command;
  return "";
}

export function directoryOf(input: Record<string, unknown>, env: NodeJS.ProcessEnv, fallback: string): string {
  if (typeof input.cwd === "string" && input.cwd.length > 0) return input.cwd;
  const roots = input.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === "string" && roots[0].length > 0) return roots[0];
  return env.CURSOR_PROJECT_DIR ?? env.CLAUDE_PROJECT_DIR ?? fallback;
}

export type Event = "reminder" | "gate";

export function runHook(runtime: Runtime, event: Event, raw: string, env: NodeJS.ProcessEnv, cwd: string, probe: Probe): string {
  try {
    const input = readInput(raw);
    const dir = directoryOf(input, env, cwd);
    if (event === "reminder") {
      return renderContextOutput(reminderText(dir, env, probe), runtime, { event: "UserPromptSubmit" });
    }
    const decision = decideGate(commandOf(input), dir, env, probe);
    return decision.decision === "deny" ? renderDeny(runtime, decision) : renderAllow(runtime);
  } catch {
    return event === "gate" ? renderAllow(runtime) : "";
  }
}

function git(dir: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
  } catch {
    return null;
  }
}

export function gitProbe(pluginRoot: string): Probe {
  return {
    platformFor(dir) {
      const top = git(dir, ["rev-parse", "--show-toplevel"]);
      if (top === null || top.length === 0) return null;
      const read = readPlatformFile(pluginRoot, join(top, "CLAUDE.md"));
      return read.status === "found" ? read.value : null;
    },
    branchFor(dir) {
      return git(dir, ["branch", "--show-current"]);
    },
    refExists(dir, ref) {
      return git(dir, ["show-ref", "--verify", "--quiet", ref]) !== null;
    },
  };
}

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  const args = process.argv.slice(2);
  const runtime: Runtime = argument(args, "--runtime") === "cursor" ? "cursor" : "claude";
  const event: Event = argument(args, "--event") === "reminder" ? "reminder" : "gate";
  let output = event === "gate" ? renderAllow(runtime) : "";
  try {
    const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    output = runHook(runtime, event, readFileSync(0, "utf8"), process.env, process.cwd(), gitProbe(pluginRoot));
  } catch {
    // fail open: the allow (or silence) chosen above stands
  }
  if (output.length > 0) process.stdout.write(`${output}\n`);
}
