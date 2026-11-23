import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "verify-vault-file.ts");
const URL = "https://github.com/acme/app/issues/7";

function run(args: string[], env: NodeJS.ProcessEnv = { NERDWAY_MACHINE: "workstation" }) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
}

function wiki(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "verify-vault-"));
  const dir = join(root, "wiki");
  mkdirSync(join(dir, "guides"), { recursive: true });
  return { root, dir };
}

test("a non-empty file holding the URL on a workstation is verified", () => {
  const { root, dir } = wiki();
  try {
    writeFileSync(join(dir, "guides", "app.md"), `# App\n\nSource: ${URL}\n`);
    const result = run([dir, "guides/app.md", "--contains", URL]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^verified guides\/app\.md \d+ bytes sha256:[0-9a-f]{12} on \S+ \d{4}-\d{2}-\d{2}\n$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an absolute path inside the wiki is accepted and printed relative", () => {
  const { root, dir } = wiki();
  try {
    writeFileSync(join(dir, "guides", "app.md"), URL);
    const result = run([dir, join(dir, "guides", "app.md"), "--contains", URL]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^verified guides\/app\.md /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing, empty or URL-less file is not verified (exit 1)", () => {
  const { root, dir } = wiki();
  try {
    writeFileSync(join(dir, "guides", "empty.md"), "");
    writeFileSync(join(dir, "guides", "other.md"), "no link here\n");
    for (const [path, message] of [
      ["guides/missing.md", /does not exist/],
      ["guides/empty.md", /is empty/],
      ["guides/other.md", /does not contain/],
    ] as const) {
      const result = run([dir, path, "--contains", URL]);
      assert.equal(result.status, 1, path);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, message);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file on a remote machine is never verified (exit 3), even when it is complete", () => {
  const { root, dir } = wiki();
  try {
    writeFileSync(join(dir, "guides", "app.md"), URL);
    for (const env of [{ NERDWAY_MACHINE: "remote" }, { CLAUDE_CODE_REMOTE: "true" }]) {
      const result = run([dir, "guides/app.md", "--contains", URL], env);
      assert.equal(result.status, 3, JSON.stringify(env));
      assert.match(result.stderr, /not the live wiki/);
    }
    const chat = run([dir, "guides/app.md", "--contains", URL, "--host", "slack-thread"], {});
    assert.equal(chat.status, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a path outside the wiki and missing arguments are usage errors (exit 2)", () => {
  const { root, dir } = wiki();
  try {
    writeFileSync(join(root, "outside.md"), URL);
    assert.equal(run([dir, "../outside.md", "--contains", URL]).status, 2);
    assert.equal(run([dir, "guides/app.md"]).status, 2);
    assert.equal(run([]).status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
