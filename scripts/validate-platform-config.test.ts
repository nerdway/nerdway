import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "validate-platform-config.ts");

function run(args: string[], env: NodeJS.ProcessEnv) {
  const { NERDWAY_CONFIG_DIR: _ignored, ...base } = process.env;
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...base, ...env } });
}

function repoWithConfig(yaml: string | null, claudeMd?: string) {
  const root = mkdtempSync(join(tmpdir(), "platform-cli-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const configDir = join(root, "config");
  mkdirSync(configDir);
  if (yaml !== null) {
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "repo", "config.yml"), yaml);
  }
  if (claudeMd !== undefined) writeFileSync(join(repo, "CLAUDE.md"), claudeMd);
  return { root, repo, env: { NERDWAY_CONFIG_DIR: configDir } as NodeJS.ProcessEnv };
}

const VALID = "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n";
const LEGACY = "## Platform\n\n```yaml\ntracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\n```\n";

test("--print: a valid user config exits 0 with the config as JSON on stdout", () => {
  const { root, repo, env } = repoWithConfig(VALID);
  try {
    const result = run(["--print", repo], env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { tracker: "github", vcs: "github", github: { owner: "acme", repo: "app" } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--print: no config exits 3, so the skill moves on to its next source", () => {
  const { root, repo, env } = repoWithConfig(null);
  try {
    assert.equal(run(["--print", repo], env).status, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--print: a broken project file exits 4, never 1, which stays Node's own failure", () => {
  const { root, repo, env } = repoWithConfig("tracker: basecamp\nvcs: github\n");
  try {
    const result = run(["--print", repo], env);
    assert.equal(result.status, 4);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /basecamp/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--print: tracker jira with site and project exits 0", () => {
  const yaml = "tracker: jira\nvcs: github\njira:\n  site: acme.atlassian.net\n  project: PROJ\ngithub:\n  owner: acme\n  repo: app\n";
  const { root, repo, env } = repoWithConfig(yaml);
  try {
    const result = run(["--print", repo], env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      tracker: "jira",
      vcs: "github",
      jira: { site: "acme.atlassian.net", project: "PROJ" },
      github: { owner: "acme", repo: "app" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--print: a conflicting legacy section exits 5", () => {
  const { root, repo, env } = repoWithConfig(VALID, LEGACY);
  try {
    const result = run(["--print", repo], env);
    assert.equal(result.status, 5);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /legacy|differ|conflict/i);
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--print: clear-case migration writes the user config then prints it", () => {
  const { root, repo, env } = repoWithConfig(null, LEGACY);
  try {
    const result = run(["--print", repo], env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { tracker: "github", vcs: "github", github: { owner: "nerdway", repo: "nerdway" } });
    assert.equal(existsSync(join(repo, "CLAUDE.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--resolve keep-user|take-repo|merge finishes a conflict and removes the section", () => {
  for (const choice of ["keep-user", "take-repo", "merge"] as const) {
    const { root, repo, env } = repoWithConfig(VALID, LEGACY);
    try {
      const result = run(["--print", "--resolve", choice, repo], env);
      assert.equal(result.status, 0, `${choice}: ${result.stderr}`);
      assert.equal(existsSync(join(repo, "CLAUDE.md")), false, choice);
      const value = JSON.parse(result.stdout) as { github: { owner: string } };
      assert.equal(value.github.owner, choice === "take-repo" ? "nerdway" : "acme", choice);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
