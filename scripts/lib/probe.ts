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

export interface RunOptions {
  shell?: boolean;
}

export type Runner = (argv: string[], options?: RunOptions) => Promise<CommandResult>;

export interface ProbeEnvironment {
  run?: Runner;
  platform?: NodeJS.Platform;
}

const PLAIN_ARGUMENT = /^[A-Za-z0-9_+.:\/\\@-]+$/;

export function windowsCommandLine(argv: string[]): string {
  return argv.map((arg) => {
    if (/["%\r\n]/.test(arg)) throw new Error(`cmd.exe cannot pass this argument on safely: ${JSON.stringify(arg)}`);
    if (PLAIN_ARGUMENT.test(arg)) return arg;
    return `"${arg.replace(/(\\+)$/, "$1$1")}"`;
  }).join(" ");
}

export function runCommand(argv: string[], { shell = process.platform === "win32" }: RunOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    // win32 needs a shell: npm and npm-installed CLIs are .cmd shims, which
    // Node refuses to spawn directly (CVE-2024-27980). argv comes from the
    // static contract, never from user input, so the shell adds no injection
    // surface.
    const child = spawn(argv[0], argv.slice(1), { shell, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", () => resolve({ code: null, stdout, stderr }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export async function probe(entry: CliEntry, { run = runCommand, platform = process.platform }: ProbeEnvironment = {}): Promise<ProbeResult> {
  const result = await run(entry.versionCommand);
  if (result.code === null) return { status: "missing" };

  const output = `${result.stdout}${result.stderr}`;
  const version = extractVersion(output, entry.versionRegex);
  if (version === null) {
    if (platform === "win32") {
      const lookup = await run(["where.exe", entry.versionCommand[0]], { shell: false });
      if (lookup.code !== null && lookup.code !== 0) return { status: "missing" };
    }
    return { status: "unknown", output: output.trim() };
  }

  return satisfiesMinimum(version, entry.minVersion)
    ? { status: "ok", version }
    : { status: "outdated", version };
}
