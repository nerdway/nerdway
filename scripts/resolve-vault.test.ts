import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "resolve-vault.ts");

function run(args: string[], env: NodeJS.ProcessEnv) {
  const { NERDWAY_CONFIG_DIR: _ignored, NERDWAY_WIKI: _wiki, NERDBRAIN_VAULT: _legacy, ...base } = process.env;
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
    assert.match(result.stderr, /wiki\.path must be a string/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
