import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "resolve-vault.ts");

function run(args: string[], env: NodeJS.ProcessEnv) {
  const {
    NERDWAY_CONFIG_DIR: _ignored,
    NERDWAY_WIKI: _wiki,
    NERDBRAIN_VAULT: _legacy,
    NERDWAY_MACHINE: _machine,
    NERDWAY_HOST: _host,
    AGENT_HOST: _agentHost,
    GROK_BOT: _bot,
    CLAUDE_CODE_REMOTE: _remote,
    CURSOR_AGENT_WORKER_ID: _worker,
    CURSOR_WORKER_POOL_NAME: _pool,
    CODESPACES: _codespaces,
    CLOUD_AGENT_INJECTED_SECRET_NAMES: _cloud,
    ...base
  } = process.env;
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...base, ...env },
  });
}

test("resolve-vault.ts prints the absolute path", () => {
  const root = mkdtempSync(join(tmpdir(), "resolve-vault-cli-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const wiki = join(root, "wiki");
    mkdirSync(wiki);
    const result = run([repo], { NERDWAY_WIKI: wiki });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${wiki}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolve-vault.ts --json prints path, source and exists", () => {
  const root = mkdtempSync(join(tmpdir(), "resolve-vault-json-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const configDir = join(root, "config");
    mkdirSync(configDir);
    const result = run(["--json", repo], { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      path: join(configDir, "wiki"),
      source: "default",
      exists: false,
      live: false,
      machine: "workstation",
      reason: "missing",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolve-vault.ts rejects a non-string wiki.path with exit 4", () => {
  const root = mkdtempSync(join(tmpdir(), "resolve-vault-invalid-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const configDir = join(root, "config");
    mkdirSync(configDir);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path:\n    nested: x\n");
    const result = run([repo], { NERDWAY_CONFIG_DIR: configDir });
    assert.equal(result.status, 4);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /wiki\.path: expected string/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolve-vault.ts --json --host marks a chat host as remote and never live", () => {
  const root = mkdtempSync(join(tmpdir(), "resolve-vault-host-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const wiki = join(root, "wiki");
    mkdirSync(wiki);
    const local = run(["--json", repo], { NERDWAY_WIKI: wiki });
    assert.equal(JSON.parse(local.stdout).live, true);
    const chat = run(["--json", "--host", "slack-thread", repo], { NERDWAY_WIKI: wiki });
    assert.equal(chat.status, 0, chat.stderr);
    assert.deepEqual(JSON.parse(chat.stdout), { path: wiki, source: "env", exists: true, live: false, machine: "remote", reason: "remote" });
    const unknown = run(["--json", "--host", "codex", repo], { NERDWAY_WIKI: wiki });
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /unknown host/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
