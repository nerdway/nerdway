import type { SkillEval, SkillEvalsFile } from "../types/evals.ts";

export interface NativeCaseFile {
  path: string;
  content: string;
}

export interface NativeCaseOptions {
  evalDir: string;
  maxTurns?: number;
}

export const EVAL_TOOLS = ["Read", "Glob", "Grep", "Skill"];

export const EVAL_SYSTEM_PROMPT = [
  "This session is an evaluation of the plugin's skills. It has no shell, no tracker and no VCS host: only Read, Glob, Grep and Skill.",
  "The working directory is an empty sandbox of the evaluation harness: its git branch, its commits, its untracked files and its missing CLAUDE.md say nothing about the task. Ignore them; the repository, its checkout, the tracker and the PR are only what the user's facts say.",
  "Treat every fact the user states (issue status, branch, working tree, PR state, command output) as the result of the command the skill would run.",
  "A command whose result the user does not state succeeds with an ordinary result.",
  "Load a skill with the Skill tool, including a skill another skill delegates to; do not read its SKILL.md with Read instead.",
  "Do not ask questions and do not wait for anything.",
  "Answer with the steps you would take, in order: each command or adapter operation the skill prescribes, what it returns given those facts, and the decision you reach, including where you stop and exactly what you report.",
].join(" ");

export const JUDGE_PREAMBLE = [
  "The response describes what an agent following the skill does with the facts in the prompt. The session had no shell, tracker or VCS host, so a command the response says it runs counts as run.",
  "An adapter operation (such as issue.read-relations, issue.read-status or pr.view) counts as run when the response runs the command the adapter gives for it, whether or not it names the operation.",
  "A command the response names only as a step it did not run, or would skip, does not count as run.",
].join(" ");

const DEFAULT_MAX_TURNS = 20;
const PLAIN_ID = /^[a-z0-9][a-z0-9-]*$/i;
const PLAIN_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function caseName(skill: string, id: string): string {
  return `${skill}--${id}`;
}

function frontmatter(fields: Record<string, unknown>, body: string): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

export function parseFrontmatter(content: string): { fields: Record<string, unknown>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(content);
  if (match === null) throw new Error("no frontmatter block");
  const fields: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(": ");
    fields[line.slice(0, at)] = JSON.parse(line.slice(at + 2));
  }
  return { fields, body: match[2] };
}

function evalDirDepth(evalDir: string): number {
  const segments = evalDir.split("/").filter((segment) => segment.length > 0);
  if (evalDir.startsWith("/") || segments.length === 0 || !segments.every((segment) => PLAIN_SEGMENT.test(segment))) {
    throw new Error(`evalDir must be a relative path of plain directory names below the plugin root: ${evalDir}`);
  }
  return segments.length;
}

function outcomeRubric(expected: string): string {
  return [
    JUDGE_PREAMBLE,
    "",
    "PASS if the described steps and the decision match this expected outcome:",
    "",
    expected,
    "",
    "FAIL if they contradict it, skip a step it requires, or stop at a different point.",
  ].join("\n");
}

function assertionRubric(assertion: string): string {
  return [
    JUDGE_PREAMBLE,
    "",
    `PASS if this holds for the described steps and decision: ${assertion}`,
    "FAIL if it does not hold, or the response does not make it clear.",
  ].join("\n");
}

function skillFiredPattern(skill: string): string {
  return `"skill"\\s*:\\s*"(?:[\\w-]+:)?${skill}"`;
}

function caseFiles(skill: string, evalCase: SkillEval, plugins: string, maxTurns: number): NativeCaseFile[] {
  if (!PLAIN_ID.test(evalCase.id)) throw new Error(`eval id must be a plain kebab-case name: ${evalCase.id}`);
  if (evalCase.files.length > 0) {
    throw new Error(`eval '${evalCase.id}' lists fixture files, which the converter does not support yet`);
  }
  const dir = `${skill}/${evalCase.id}`;
  const expected = evalCase.expected_output.trim();
  const files: NativeCaseFile[] = [
    {
      path: `${dir}/prompt.md`,
      content: frontmatter(
        {
          name: caseName(skill, evalCase.id),
          description: `${skill} eval ${evalCase.id}, converted from skills/${skill}/evals/evals.json`,
          tags: [skill],
          plugins: [plugins],
          expected_outcome: expected || undefined,
          max_turns: maxTurns,
          allowed_tools: EVAL_TOOLS,
          append_system_prompt: EVAL_SYSTEM_PROMPT,
        },
        evalCase.prompt,
      ),
    },
  ];
  if (expected) {
    files.push({ path: `${dir}/graders/outcome.md`, content: frontmatter({ type: "llm" }, outcomeRubric(expected)) });
  }
  evalCase.assertions.forEach((assertion, index) => {
    const number = String(index + 1).padStart(2, "0");
    files.push({ path: `${dir}/graders/assertion-${number}.md`, content: frontmatter({ type: "llm" }, assertionRubric(assertion)) });
  });
  files.push({
    path: `${dir}/graders/skill-fired.md`,
    content: frontmatter({ type: "tool_used", tool: "Skill", input_match: skillFiredPattern(skill) }, ""),
  });
  return files;
}

export function toNativeCases(file: SkillEvalsFile, options: NativeCaseOptions): NativeCaseFile[] {
  const plugins = Array.from({ length: evalDirDepth(options.evalDir) + 2 }, () => "..").join("/");
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  return file.evals.flatMap((evalCase) => caseFiles(file.skill_name, evalCase, plugins, maxTurns));
}
