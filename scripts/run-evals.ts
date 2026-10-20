import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { toNativeCases } from "./lib/eval-cases.ts";
import { claudeArgs, parseRunArgs } from "./lib/eval-run.ts";
import { findEvalsFiles, readEvalsFile, type SkillEvalsFile } from "./types/evals.ts";

const USAGE = `usage: node scripts/run-evals.ts [--skill <name>]... [--dry-run] [--keep-cases] [claude plugin eval options]

Converts skills/*/evals/evals.json into claude plugin eval cases under eval-cases/<stamp>/,
runs them against this plugin and writes the results to results/<stamp>/.
  --skill <name>   run only this skill (repeatable, or comma-separated)
  --dry-run        write the cases and print the command, run nothing
  --keep-cases     keep eval-cases/<stamp>/ after the run
Every other option goes to claude plugin eval (--runs, --max-cost-usd, --no-publish,
--ablation, --model, --judge-model, --json, --output-dir, ...). Granting Bash or MCP
tools, --mocks off, --allow-real-servers, --scaffold and --eval-dir are refused.`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseRunArgs(process.argv.slice(2));

if ("error" in args) {
  console.error(`error: ${args.error}\n\n${USAGE}`);
  process.exit(2);
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const available = new Map(findEvalsFiles(root).map((path) => [basename(dirname(dirname(path))), path]));
const unknown = args.skills.filter((skill) => !available.has(skill));
if (unknown.length > 0) {
  console.error(`error: no skills/<name>/evals/evals.json for ${unknown.join(", ")}`);
  process.exit(2);
}

const selected = args.skills.length > 0 ? [...new Set(args.skills)] : [...available.keys()];
const files: SkillEvalsFile[] = [];
let invalid = false;
for (const skill of selected) {
  const path = available.get(skill) as string;
  const { file, errors } = readEvalsFile(path);
  if (file === undefined) {
    invalid = true;
    console.error(`${relative(root, path)} validation failed:`);
    for (const error of errors) console.error(`  - ${error}`);
    continue;
  }
  files.push(file);
}
if (invalid) process.exit(1);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evalDir = `eval-cases/${stamp}`;
const outputDir = join(root, "results", stamp);
let count = 0;
for (const file of files) {
  for (const item of toNativeCases(file, { evalDir })) {
    const target = join(root, evalDir, item.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, item.content);
    if (item.path.endsWith("/prompt.md")) count += 1;
  }
}

const command = claudeArgs({ root, evalDir, outputDir, passthrough: args.passthrough });
console.log(`${count} case(s) from ${files.map((file) => file.skill_name).join(", ")} written to ${evalDir}/`);
console.log(`claude ${command.join(" ")}`);

if (args.dryRun) {
  process.exit(0);
}

const result = spawnSync("claude", command, { cwd: root, stdio: "inherit" });
if (!args.keepCases) rmSync(join(root, evalDir), { recursive: true, force: true });
if (result.error !== undefined) {
  console.error(`error: could not start claude: ${result.error.message}`);
  process.exit(2);
}
console.log(`results: ${relative(root, outputDir)}/ (unless --output-dir or --json said otherwise)`);
process.exit(result.status ?? 1);
