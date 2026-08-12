import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateContract, type CliContract, type CliEntry, type InstallStrategy } from "./types/cli-dependencies.ts";
import { applyInstall, applyNpmInstall, installDir } from "./lib/install.ts";
import { platformKey } from "./lib/platform.ts";
import { probe, runCommand } from "./lib/probe.ts";
import { SATISFIED, decideAfterInstall, formatReport, type Outcome, type Status } from "./lib/status.ts";

const checkOnly = process.argv.includes("--check");
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const raw: unknown = JSON.parse(readFileSync(join(repoRoot, "cli-dependencies.json"), "utf8"));
const skillDirs = readdirSync(join(repoRoot, "skills"), { withFileTypes: true })
  .filter((item) => item.isDirectory())
  .map((item) => item.name);

const contractErrors = validateContract(raw, skillDirs);
if (contractErrors.length > 0) {
  console.error("cli-dependencies.json is invalid:");
  for (const error of contractErrors) console.error(`  - ${error}`);
  process.exit(1);
}

const contract = raw as CliContract;
const key = platformKey(process.platform, process.arch);

async function withAuth(entry: CliEntry, status: Status, detail: string): Promise<Outcome> {
  if (!SATISFIED.includes(status) || !entry.auth) return { id: entry.id, status, detail };
  const result = await runCommand(entry.auth.check);
  return result.code === 0
    ? { id: entry.id, status, detail }
    : { id: entry.id, status: "NEEDS_AUTH", detail: entry.auth.instructions };
}

async function reconcileEntry(entry: CliEntry): Promise<Outcome> {
  const first = await probe(entry);

  if (first.status === "ok") return withAuth(entry, "OK", first.version);
  if (first.status === "unknown") return { id: entry.id, status: "UNKNOWN", detail: first.output };

  const fallback = entry.manualInstall ?? "no install path declared";
  const strategy = key && entry.install ? entry.install[key] : undefined;

  if (!strategy && !entry.npm) {
    const status: Status = entry.install ? "UNSUPPORTED" : first.status === "missing" ? "MISSING" : "OUTDATED";
    return { id: entry.id, status, detail: fallback };
  }
  if (checkOnly) {
    return { id: entry.id, status: first.status === "missing" ? "MISSING" : "OUTDATED", detail: "install skipped (--check)" };
  }

  const outcome = entry.npm ? await applyNpmInstall(entry.npm) : await applyInstall(entry, strategy as InstallStrategy);
  const placed = entry.npm ? outcome.ok : Boolean(outcome.placedAt) && existsSync(outcome.placedAt as string);
  const second = await probe(entry);
  const status = decideAfterInstall(first.status, second, placed);

  const detail = status === "NEEDS_PATH"
    ? entry.npm
      ? `add ${outcome.placedAt ?? "the npm global bin"} to PATH`
      : `placed at ${outcome.placedAt}; add ${installDir()} to PATH`
    : outcome.ok ? outcome.detail : `${outcome.detail} (${fallback})`;

  return withAuth(entry, status, detail);
}

const outcomes: Outcome[] = [];
for (const entry of contract.clis) {
  outcomes.push(await reconcileEntry(entry));
}

console.log(formatReport(outcomes));
process.exit(outcomes.every((outcome) => SATISFIED.includes(outcome.status)) ? 0 : 1);
