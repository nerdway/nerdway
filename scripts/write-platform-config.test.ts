import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseYaml } from "./types/platform-config.ts";

const script = join(dirname(fileURLToPath(import.meta.url)), "write-platform-config.ts");

function write(args: string[], yaml: string, env: NodeJS.ProcessEnv) {
  const { NERDWAY_CONFIG_DIR: _ignored, ...base } = process.env;
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    input: yaml,
    env: { ...base, ...env },
  });
}

test("write-platform-config writes a validated project config", () => {
  const root = mkdtempSync(join(tmpdir(), "write-platform-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const yaml = "tracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\n";
    const run = write(["--repo", repo], yaml, { NERDWAY_CONFIG_DIR: join(root, "config") });
    assert.equal(run.status, 0, run.stderr);
    const written = readFileSync(join(root, "config", "repo", "config.yml"), "utf8");
    assert.deepEqual(parseYaml(written).value, {
      tracker: "github",
      vcs: "github",
      github: { owner: "nerdway", repo: "nerdway" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("write-platform-config --defaults writes the user-wide config.yml", () => {
  const root = mkdtempSync(join(tmpdir(), "write-defaults-"));
  try {
    const yaml = "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n";
    const run = write(["--defaults"], yaml, { NERDWAY_CONFIG_DIR: join(root, "config") });
    assert.equal(run.status, 0, run.stderr);
    const written = readFileSync(join(root, "config", "config.yml"), "utf8");
    assert.deepEqual(parseYaml(written).value, {
      tracker: "github",
      vcs: "github",
      github: { owner: "acme", repo: "app" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("write-platform-config --keys merges only those keys into the project config", () => {
  const root = mkdtempSync(join(tmpdir(), "write-keys-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const configDir = join(root, "config");
    mkdirSync(join(configDir, "repo"), { recursive: true });
    writeFileSync(
      join(configDir, "repo", "config.yml"),
      "tracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\nado:\n  org: acme\n  project: Shop\n",
    );
    const run = write(
      ["--repo", repo, "--keys", "statuses,ado"],
      [
        "statuses:",
        "  strategy: label",
        "  map:",
        "    backlog: open",
        "    todo: status::todo",
        "    in-progress: status::in-progress",
        "    in-review: status::in-review",
        "    done: closed",
        "ado:",
        "  org: acme",
        "  project: Shop",
        "  team: Shop Team",
        "  board: Stories",
      ].join("\n"),
      { NERDWAY_CONFIG_DIR: configDir },
    );
    assert.equal(run.status, 0, run.stderr);
    const written = parseYaml(readFileSync(join(configDir, "repo", "config.yml"), "utf8")).value;
    assert.equal(written?.tracker, "github");
    assert.deepEqual(written?.github, { owner: "nerdway", repo: "nerdway" });
    assert.deepEqual(written?.ado, { org: "acme", project: "Shop", team: "Shop Team", board: "Stories" });
    assert.equal((written?.statuses as { strategy?: string } | undefined)?.strategy, "label");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("write-platform-config rejects an invalid config with exit 4", () => {
  const root = mkdtempSync(join(tmpdir(), "write-invalid-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const run = write(["--repo", repo], "tracker: basecamp\nvcs: github\n", { NERDWAY_CONFIG_DIR: join(root, "config") });
    assert.equal(run.status, 4);
    assert.equal(run.stdout, "");
    assert.match(run.stderr, /basecamp/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
