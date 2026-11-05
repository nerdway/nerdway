import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const compact = (path: string) => read(path).replace(/\s+/g, " ");

type EvalCase = { id: string; prompt: string; expected_output: string; assertions: string[] };

function evalCases(path: string): EvalCase[] {
  return JSON.parse(read(path)).evals;
}

function requiredCase(path: string, id: string): EvalCase {
  const found = evalCases(path).find((evalCase) => evalCase.id === id);
  assert.ok(found, `missing eval id ${id} in ${path}`);
  return found;
}

function bodyOf(evalCase: EvalCase): string {
  return [evalCase.prompt, evalCase.expected_output, ...evalCase.assertions].join("\n");
}

const SKILL = "skills/nerd-orchestrate/SKILL.md";
const REFERENCE = "skills/nerd-orchestrate/reference.md";
const EVALS = "skills/nerd-orchestrate/evals/evals.json";

test("nerd-orchestrate is model-invokable and catches PL/EN triggers", () => {
  const source = read(SKILL);
  const frontmatter = source.slice(0, source.indexOf("\n---", 4) + 4);
  assert.doesNotMatch(frontmatter, /disable-model-invocation/);
  assert.match(frontmatter, /orkiestruj/);
  assert.match(frontmatter, /orchestrate/);
  assert.match(frontmatter, /zaplanuj projekt/);
  assert.match(frontmatter, /worktrees/);
  assert.match(frontmatter, /argument-hint:/);
});

test("nerd-orchestrate invokes project-continue read-only then filters unplanned issues", () => {
  const skill = compact(SKILL);
  assert.match(skill, /nerdway:project-continue/);
  assert.match(skill, /do not record a checkpoint unless/);
  assert.match(skill, /unplanned issue/);
  assert.match(skill, /first line is exactly/);
  assert.match(skill, /## Implementation plan/);
  assert.match(skill, /`in-review` is open and never unplanned/);
  assert.match(skill, /scripts\/lib\/implementation-plan\.ts/);
});

test("nerd-orchestrate always asks batch versus just-in-time, then asks before AIM", () => {
  const skill = compact(SKILL);
  assert.match(skill, /Planning-mode menu/);
  assert.match(skill, /Always ask/);
  assert.match(skill, /Batch/);
  assert.match(skill, /Just-in-time/);
  assert.match(skill, /Ask before AIM/);
  assert.match(skill, /After every posted plan/);
  assert.match(skill, /Run auto-issue-mode/);
  assert.match(skill, /Skip AIM/);
  assert.match(skill, /planning-mode answer as AIM consent/);
});

test("nerd-orchestrate planning is issue-workflow Planning only", () => {
  const skill = compact(SKILL);
  assert.match(skill, /Planning phase only/);
  assert.match(skill, /nerdway:issue-workflow/);
  assert.match(skill, /write phase `todo`/);
  assert.match(skill, /Do not Start/);
  assert.match(skill, /Stop \*\*before\*\* `post-plan\.after-plan`/);
});

test("nerd-orchestrate AIM dispatch caps worktrees on Claude Code and Cursor and not on Grok Bot", () => {
  const skill = compact(SKILL);
  const reference = compact(REFERENCE);
  assert.match(skill, /host\.detect/);
  assert.match(skill, /scripts\/lib\/host-detect\.ts/);
  assert.match(skill, /scripts\/lib\/orchestrate-dispatch\.ts/);
  assert.match(skill, /at most \*\*two\*\* worktrees/);
  assert.match(skill, /grok-bot/);
  assert.match(skill, /Do \*\*not\*\* add local worktrees as the parallel path/);
  assert.match(skill, /CloudAgent/);
  assert.match(skill, /entry B/);
  assert.match(skill, /disable-model-invocation/);
  assert.match(reference, /git worktree add/);
  assert.match(reference, /ORCHESTRATE_PARALLEL_CAP/);
  assert.match(reference, /Do not `git worktree add` here/);
});

test("nerd-orchestrate evals cover resolve, unplanned filter, asks, and host branches", () => {
  const resolve = requiredCase(EVALS, "resolve-optional-path-defaults-to-cwd");
  const filter = requiredCase(EVALS, "unplanned-filter-first-line-exactly");
  const progress = requiredCase(EVALS, "progress-invokes-project-continue-read-only");
  const mode = requiredCase(EVALS, "planning-mode-always-asks-batch-vs-jit");
  const ask = requiredCase(EVALS, "ask-before-aim-after-every-posted-plan");
  const plan = requiredCase(EVALS, "plan-phase-only-no-start");
  const cc = requiredCase(EVALS, "host-worktree-cap-claude-code");
  const cursor = requiredCase(EVALS, "host-cursor-worktree-and-fallback");
  const grok = requiredCase(EVALS, "host-grok-bot-sequential-or-cloud-agent");
  const empty = requiredCase(EVALS, "zero-unplanned-stops-without-menu");

  assert.match(bodyOf(resolve), /current working directory/);
  assert.match(bodyOf(resolve), /path argument/);

  assert.match(bodyOf(filter), /first line is exactly `## Implementation plan`/);
  assert.match(bodyOf(filter), /in-review/);
  assert.match(bodyOf(filter), /DEMO-503/);
  assert.match(bodyOf(filter), /zrób od razu/);

  assert.match(bodyOf(progress), /project-continue/);
  assert.match(bodyOf(progress), /checkpoint/);

  assert.match(bodyOf(mode), /batch versus just-in-time|Batch/);
  assert.match(bodyOf(mode), /AskUserQuestion/);
  assert.match(bodyOf(mode), /does not default/);

  assert.match(bodyOf(ask), /asks before auto-issue-mode/);
  assert.match(bodyOf(ask), /not treated as AIM consent/);

  assert.match(bodyOf(plan), /does not Start/);
  assert.match(bodyOf(plan), /does not run post-plan\.after-plan/);

  assert.match(bodyOf(cc), /At most two git worktrees/);
  assert.match(bodyOf(cursor), /sequentially/);
  assert.match(bodyOf(grok), /SendToUser/);
  assert.match(bodyOf(grok), /does not use local git worktrees/);
  assert.match(bodyOf(empty), /planning-mode question is not asked/);
});
