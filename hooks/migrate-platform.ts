import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderContextOutput, type Runtime } from "../scripts/lib/install-check.ts";
import { migrateLegacyPlatform, migrationNotice } from "../scripts/lib/nerdway-config.ts";
import { pluginVocabulary, trackerAdapterSources } from "../scripts/lib/platform-read.ts";
import { projectDirectory } from "./session-start.ts";

function gitTopLevel(dir: string): string {
  try {
    const top = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return top.length > 0 ? top : dir;
  } catch {
    return dir;
  }
}

export function runMigrate(runtime: Runtime, raw: string, env: NodeJS.ProcessEnv, cwd: string, pluginRoot: string): string {
  const dir = gitTopLevel(projectDirectory(raw, cwd));
  const result = migrateLegacyPlatform(dir, env, {
    vocabulary: pluginVocabulary(pluginRoot),
    trackerAdapters: trackerAdapterSources(pluginRoot),
  });
  if (result.status === "unchanged") return "";
  if (result.status === "conflict") {
    const report = [
      "nerdway: a legacy ## Platform section in CLAUDE.md could not be migrated.",
      ...result.errors,
      "Ask the user to keep the user config, take the repo values, or merge, then run:",
      `node scripts/validate-platform-config.ts --resolve keep-user|take-repo|merge ${dir}`,
    ].join("\n");
    return renderContextOutput(report, runtime, { event: "SessionStart" });
  }
  return renderContextOutput(migrationNotice(result), runtime, { event: "SessionStart" });
}

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(resolve(invoked)).href) {
  const runtime: Runtime = argument(process.argv.slice(2), "--runtime") === "cursor" ? "cursor" : "claude";
  const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const output = runMigrate(runtime, readFileSync(0, "utf8"), process.env, process.cwd(), pluginRoot);
  if (output.length > 0) process.stdout.write(`${output}\n`);
}
