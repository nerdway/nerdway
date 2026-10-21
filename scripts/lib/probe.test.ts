import { test } from "node:test";
import assert from "node:assert/strict";

import { probe, runCommand, windowsCommandLine, type CommandResult, type RunOptions } from "./probe.ts";
import type { CliEntry } from "../types/cli-dependencies.ts";

function nodeEntry(overrides: Partial<CliEntry> = {}): CliEntry {
  return {
    id: "node",
    minVersion: "24.0.0",
    versionCommand: ["node", "--version"],
    versionRegex: "v(\\d+\\.\\d+\\.\\d+)",
    requiredBy: ["issue-workflow"],
    ...overrides,
  };
}

test("runCommand captures stdout and exit code", async () => {
  const result = await runCommand(["node", "--version"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^v\d+\.\d+\.\d+/);
});

test("runCommand reports a null code for a binary that does not exist, or cmd.exe's non-zero exit on win32", async () => {
  const result = await runCommand(["definitely-not-a-real-binary-xyz"]);
  if (process.platform === "win32") {
    assert.equal(typeof result.code, "number");
    assert.notEqual(result.code, 0);
  } else {
    assert.equal(result.code, null);
  }
});

test("probe reports ok for an installed CLI meeting the minimum", async () => {
  const result = await probe(nodeEntry());
  assert.equal(result.status, "ok");
});

test("probe reports outdated when the minimum is above the installed version", async () => {
  const result = await probe(nodeEntry({ minVersion: "999.0.0" }));
  assert.equal(result.status, "outdated");
  assert.match((result as { version: string }).version, /^\d+\.\d+\.\d+$/);
});

test("probe reports missing for an absent binary", async () => {
  const entry = nodeEntry({ versionCommand: ["definitely-not-a-real-binary-xyz", "--version"] });
  assert.equal((await probe(entry)).status, "missing");
});

test("probe reports unknown when the regex does not match the output", async () => {
  const result = await probe(nodeEntry({ versionRegex: "totally unmatched (\\d+)" }));
  assert.equal(result.status, "unknown");
});

function fakeRun(results: Record<string, CommandResult>) {
  const calls: { argv: string[]; options?: RunOptions }[] = [];
  const run = async (argv: string[], options?: RunOptions): Promise<CommandResult> => {
    calls.push({ argv, options });
    const result = results[argv[0]];
    if (!result) throw new Error(`unexpected command ${argv[0]}`);
    return result;
  };
  return { run, calls };
}

const notRecognized: CommandResult = { code: 1, stdout: "", stderr: "Polecenie 'glab' nie jest rozpoznawane." };
const glabEntry = nodeEntry({ id: "glab", versionCommand: ["glab", "--version"], versionRegex: "glab version (\\d+\\.\\d+\\.\\d+)" });

test("on linux an unparseable version output stays unknown and runs nothing else", async () => {
  const { run, calls } = fakeRun({ glab: { code: 0, stdout: "garbage", stderr: "" } });
  const result = await probe(glabEntry, { run, platform: "linux" });
  assert.deepEqual(result, { status: "unknown", output: "garbage" });
  assert.equal(calls.length, 1);
});

test("on win32 a command that where.exe cannot find is missing, whatever cmd.exe printed", async () => {
  const { run } = fakeRun({ glab: notRecognized, "where.exe": { code: 1, stdout: "", stderr: "INFO: Could not find files" } });
  assert.deepEqual(await probe(glabEntry, { run, platform: "win32" }), { status: "missing" });
});

test("on win32 a command that where.exe finds but whose output does not parse stays unknown", async () => {
  const { run } = fakeRun({ glab: { code: 0, stdout: "garbage", stderr: "" }, "where.exe": { code: 0, stdout: "C:\\Tools\\glab.exe\r\n", stderr: "" } });
  assert.deepEqual(await probe(glabEntry, { run, platform: "win32" }), { status: "unknown", output: "garbage" });
});

test("on win32 a lookup that cannot run at all proves nothing, so the probe stays unknown", async () => {
  const { run } = fakeRun({ glab: notRecognized, "where.exe": { code: null, stdout: "", stderr: "" } });
  assert.equal((await probe(glabEntry, { run, platform: "win32" })).status, "unknown");
});

test("on win32 the lookup asks where.exe for the command name without a shell", async () => {
  const { run, calls } = fakeRun({ glab: notRecognized, "where.exe": { code: 1, stdout: "", stderr: "" } });
  await probe(glabEntry, { run, platform: "win32" });
  assert.deepEqual(calls[1], { argv: ["where.exe", "glab"], options: { shell: false } });
});

test("windowsCommandLine leaves plain arguments as they are", () => {
  assert.equal(windowsCommandLine(["npm", "install", "--global", "linearis"]), "npm install --global linearis");
  assert.equal(windowsCommandLine(["tar", "-xzf", "C:\\Temp\\a.tgz", "-C", "C:\\Temp\\w"]), "tar -xzf C:\\Temp\\a.tgz -C C:\\Temp\\w");
});

test("windowsCommandLine quotes an argument with a space, a cmd.exe metacharacter or nothing in it", () => {
  assert.equal(
    windowsCommandLine(["tar", "-xzf", "C:\\Users\\Jan Kowalski\\AppData\\Local\\Temp\\a.tgz"]),
    'tar -xzf "C:\\Users\\Jan Kowalski\\AppData\\Local\\Temp\\a.tgz"',
  );
  assert.equal(windowsCommandLine(["echo", "a&b", "x|y", ""]), 'echo "a&b" "x|y" ""');
  assert.equal(windowsCommandLine(["dir", "C:\\Users\\Paweł Wlazło\\"]), 'dir "C:\\Users\\Paweł Wlazło\\\\"');
});

test("windowsCommandLine refuses what cmd.exe cannot pass on safely", () => {
  assert.throws(() => windowsCommandLine(["echo", 'say "hi"']), /cmd\.exe/);
  assert.throws(() => windowsCommandLine(["echo", "%PATH%"]), /cmd\.exe/);
  assert.throws(() => windowsCommandLine(["echo", "a\nb"]), /cmd\.exe/);
});

test("runCommand through a shell keeps an argument with a space in one piece and raises no DEP0190", async () => {
  const warnings: string[] = [];
  const onWarning = (warning: Error & { code?: string }) => warnings.push(warning.code ?? warning.name);
  process.on("warning", onWarning);
  try {
    const result = await runCommand(["node", "-p", "process.argv[1]", "a b"], { shell: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "a b\n");
    assert.deepEqual(warnings, []);
  } finally {
    process.off("warning", onWarning);
  }
});
