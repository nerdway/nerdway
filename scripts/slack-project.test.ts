import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "slack-project.ts");

function run(args: string[], env: NodeJS.ProcessEnv) {
  const { NERDWAY_CONFIG_DIR: _ignored, ...base } = process.env;
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...base, ...env },
  });
}

function configTree(prefix: string): { root: string; configDir: string } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const configDir = join(root, "config");
  mkdirSync(configDir);
  return { root, configDir };
}

test("exit 0 prints slug, platform, owner and repoTag", () => {
  const { root, configDir } = configTree("nerdway-slack-cli-ok-");
  try {
    mkdirSync(join(configDir, "demo"));
    writeFileSync(
      join(configDir, "config.yml"),
      ["slack:", "  owner: U0123456789", "tracker: github", "vcs: github", "github:", "  owner: acme", "  repo: app", ""].join("\n"),
    );
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  channel: C0123456789\n");
    const result = run(["C0123456789"], { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(body.slug, "demo");
    assert.equal(body.owner, "U0123456789");
    assert.equal(body.repoTag, "acme/app");
    assert.equal(body.autonomous, false);
    assert.equal((body.platform as { vcs?: string }).vcs, "github");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exit 3 when no project claims the channel", () => {
  const { root, configDir } = configTree("nerdway-slack-cli-absent-");
  try {
    mkdirSync(join(configDir, "demo"));
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  channel: C0123456789\n");
    const result = run(["C0000000000"], { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 3);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /no project claims channel/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exit 4 on two claims", () => {
  const { root, configDir } = configTree("nerdway-slack-cli-two-");
  try {
    mkdirSync(join(configDir, "one"));
    mkdirSync(join(configDir, "two"));
    writeFileSync(join(configDir, "one", "config.yml"), "slack:\n  channel: C0123456789\n");
    writeFileSync(join(configDir, "two", "config.yml"), "slack:\n  channel: C0123456789\n");
    const result = run(["C0123456789"], { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 4);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /claimed by one and two/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
