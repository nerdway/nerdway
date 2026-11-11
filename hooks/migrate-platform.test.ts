import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const LEGACY = "## Platform\n\n```yaml\ntracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\n```\n";
const VALID = "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n";

function run(runtime: string, repo: string, env: NodeJS.ProcessEnv) {
  const { NERDWAY_CONFIG_DIR: _ignored, ...base } = process.env;
  return spawnSync(process.execPath, ["hooks/migrate-platform.ts", "--runtime", runtime], {
    encoding: "utf8",
    input: JSON.stringify({ cwd: repo }),
    env: { ...base, ...env },
  });
}

test("the migration hook writes a clear-case legacy section and prints one line", () => {
  const root = mkdtempSync(join(tmpdir(), "migrate-hook-clear-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    const configDir = join(root, "config");
    const result = run("cursor", repo, { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { additional_context: string };
    assert.match(output.additional_context, /migrated/);
    assert.equal(existsSync(join(repo, "CLAUDE.md")), false);
    assert.equal(existsSync(join(configDir, "repo", "config.yml")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the migration hook reports a conflict and leaves CLAUDE.md in place", () => {
  const root = mkdtempSync(join(tmpdir(), "migrate-hook-conflict-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    const configDir = join(root, "config");
    mkdirSync(join(configDir, "repo"), { recursive: true });
    writeFileSync(join(configDir, "repo", "config.yml"), VALID);
    const result = run("claude", repo, { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { hookSpecificOutput: { additionalContext: string } };
    assert.match(output.hookSpecificOutput.additionalContext, /keep the user config/);
    assert.match(output.hookSpecificOutput.additionalContext, /--resolve/);
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the migration hook prints nothing when there is no legacy section", () => {
  const root = mkdtempSync(join(tmpdir(), "migrate-hook-none-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const result = run("cursor", repo, { NERDWAY_CONFIG_DIR: join(root, "config") });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
