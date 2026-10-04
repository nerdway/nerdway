// Runs Claude Code's own plugin validator against the repo and fails on any
// error or warning, so a file Claude Code would misread (for example
// another runtime's hooks.json) cannot reach main again (DEMO-364). The
// claude.ai marketplace sync validates server-side and stricter than the
// CLI: what the CLI only warns about can fail the sync.
//
// Usage: node scripts/validate-claude-plugin.ts
// Needs the Claude Code CLI: `claude` on PATH, or CLAUDE_BIN pointing at it.
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

type Issue = { path: string; message: string };
type Report = {
  success: boolean;
  manifest?: { file: string; errors: Issue[]; warnings: Issue[] };
  contents?: { file: string; errors: Issue[]; warnings: Issue[] }[];
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const claude = process.env.CLAUDE_BIN ?? "claude";

// Targets: the marketplace (with its relative-path plugin) and the plugin
// manifest itself.
const TARGETS = [".", ".claude-plugin/plugin.json"];

// Known warnings that do not break Claude Code or the claude.ai sync. Each
// entry needs a reason; keep this list short.
const ALLOWED: { file: string; path: string; prefix: string; reason: string }[] = [
  {
    file: "CLAUDE.md",
    path: "root",
    prefix: "CLAUDE.md at the plugin root is not loaded as project context",
    reason:
      "repo CLAUDE.md carries the ## Platform section for working on this repo; present since before 0.29.0, which synced to claude.ai",
  },
];

function allowed(file: string, issue: Issue): boolean {
  const rel = relative(repoRoot, file);
  return ALLOWED.some((a) => a.file === rel && a.path === issue.path && issue.message.startsWith(a.prefix));
}

const problems: string[] = [];
let allowedCount = 0;

for (const target of TARGETS) {
  const run = spawnSync(claude, ["plugin", "validate", "--json", target], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (run.error) {
    console.error(`cannot run "${claude}": ${run.error.message}`);
    console.error("Install Claude Code (npm i -g @anthropic-ai/claude-code) or set CLAUDE_BIN.");
    process.exit(2);
  }
  let report: Report;
  try {
    report = JSON.parse(run.stdout) as Report;
  } catch {
    problems.push(`${target}: validator did not return JSON (exit ${run.status}): ${run.stderr || run.stdout}`);
    continue;
  }
  if (!report.success) problems.push(`${target}: validation failed`);
  const sections = [report.manifest, ...(report.contents ?? [])].filter((s) => s !== undefined);
  for (const section of sections) {
    const file = relative(repoRoot, section.file);
    for (const issue of section.errors) problems.push(`${target}: error in ${file}: ${issue.path}: ${issue.message}`);
    for (const issue of section.warnings) {
      if (allowed(section.file, issue)) {
        allowedCount += 1;
        continue;
      }
      problems.push(`${target}: warning in ${file}: ${issue.path}: ${issue.message}`);
    }
  }
}

if (problems.length > 0) {
  console.error("claude plugin validate found issues (warnings count as failures):");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `OK: claude plugin validate reports no errors and no warnings` +
    (allowedCount > 0 ? ` (${allowedCount} allowlisted: root CLAUDE.md)` : ""),
);
