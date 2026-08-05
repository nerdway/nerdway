import { spawn } from "node:child_process";

import type { CliEntry } from "../types/cli-dependencies.ts";
import { extractVersion, satisfiesMinimum } from "./version.ts";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type ProbeResult =
  | { status: "ok"; version: string }
  | { status: "outdated"; version: string }
  | { status: "missing" }
  | { status: "unknown"; output: string };

export function runCommand(argv: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", () => resolve({ code: null, stdout, stderr }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function probe(entry: CliEntry): Promise<ProbeResult> {
  const result = await runCommand(entry.versionCommand);
  if (result.code === null) return { status: "missing" };

  const output = `${result.stdout}${result.stderr}`;
  const version = extractVersion(output, entry.versionRegex);
  if (version === null) return { status: "unknown", output: output.trim() };

  return satisfiesMinimum(version, entry.minVersion)
    ? { status: "ok", version }
    : { status: "outdated", version };
}
