import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadCoreChecks, PROBE_IDS, type SetupCheck } from "./setup-checks.ts";
import { buildSetupState, preflightSummary, PROBES, setupContext, type SetupContext } from "./setup-state.ts";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const core = loadCoreChecks(pluginRoot).checks;
const GITHUB = "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n";

interface Fixture {
  root: string;
  repo: string;
  configDir: string;
  env: NodeJS.ProcessEnv;
}

function fixture(options: { git?: boolean; machine?: string } = {}): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "nerdway-setup-")));
  const repo = join(root, "repo");
  const configDir = join(root, "config");
  mkdirSync(repo);
  mkdirSync(configDir);
  writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
  if (options.git !== false) execFileSync("git", ["init", "-q", repo]);
  return { root, repo, configDir, env: { NERDWAY_CONFIG_DIR: configDir, NERDWAY_MACHINE: options.machine ?? "workstation", PATH: process.env.PATH } };
}

function context(f: Fixture, runs: SetupContext["runs"] = () => true): SetupContext {
  return setupContext(f.repo, pluginRoot, { env: f.env, home: f.root, runs });
}

function probe(f: Fixture, id: (typeof PROBE_IDS)[number], runs?: SetupContext["runs"]) {
  return PROBES[id](context(f, runs));
}

function withFixture(options: Parameters<typeof fixture>[0], body: (f: Fixture) => void): void {
  const f = fixture(options);
  try {
    body(f);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}

function wikiAt(f: Fixture, path: string): void {
  writeFileSync(join(f.configDir, "config.yml"), `wiki:\n  path: ${path}\n`);
}

test("every probe the contract lists has an implementation", () => {
  assert.deepEqual(Object.keys(PROBES).sort(), [...PROBE_IDS].sort());
});

test("wiki-root: ok at a wiki, warns one level too high or too deep, missing on a workstation", () => {
  withFixture({}, (f) => {
    const vault = join(f.root, "vault");
    const wiki = join(vault, "wiki");
    mkdirSync(join(wiki, "entities"), { recursive: true });
    writeFileSync(join(wiki, "index.md"), "# index\n");

    wikiAt(f, wiki);
    assert.equal(probe(f, "wiki-dir").status, "ok");

    wikiAt(f, vault);
    const high = probe(f, "wiki-dir");
    assert.equal(high.status, "warn");
    assert.match(high.findings.join("\n"), /one level too high/);
    assert.equal(high.suggestion, wiki);

    wikiAt(f, join(wiki, "entities"));
    const deep = probe(f, "wiki-dir");
    assert.equal(deep.status, "warn");
    assert.match(deep.findings.join("\n"), /one level too deep/);
    assert.equal(deep.suggestion, wiki);

    wikiAt(f, join(f.root, "nowhere"));
    assert.equal(probe(f, "wiki-dir").status, "missing");
  });
});

test("wiki-root: a missing wiki on a remote machine only warns, because writes are queued", () => {
  withFixture({ machine: "remote" }, (f) => {
    wikiAt(f, join(f.root, "nowhere"));
    const result = probe(f, "wiki-dir");
    assert.equal(result.status, "warn");
    assert.match(result.findings.join("\n"), /queued/);
  });
});

test("global-config: absent only warns, broken warns with the parse error, present is ok", () => {
  withFixture({}, (f) => {
    assert.equal(probe(f, "defaults-file").status, "warn");
    writeFileSync(join(f.configDir, "config.yml"), "wiki: [\n");
    assert.equal(probe(f, "defaults-file").status, "warn");
    writeFileSync(join(f.configDir, "config.yml"), "wiki:\n  path: ~/wiki\n");
    assert.equal(probe(f, "defaults-file").status, "ok");
  });
});

test("project probes: outside a repository everything project-scoped is missing", () => {
  withFixture({ git: false }, (f) => {
    for (const id of ["git-top-level", "project-file", "platform-read", "status-map", "tracker-board"] as const) {
      assert.equal(probe(f, id).status, "missing", id);
    }
  });
});

test("project-config and platform-config report the strategy and the recorded platform", () => {
  withFixture({}, (f) => {
    assert.equal(probe(f, "project-file").status, "missing");
    mkdirSync(join(f.repo, ".nerdway"));
    writeFileSync(join(f.repo, ".nerdway", "config.yml"), GITHUB);
    const located = probe(f, "project-file");
    assert.equal(located.status, "ok");
    assert.match(located.findings.join("\n"), /strategy repo/);
    assert.deepEqual(probe(f, "platform-read"), { status: "ok", findings: ["tracker github, vcs github"] });
    assert.equal(probe(f, "status-map").status, "ok");
    assert.equal(probe(f, "tracker-board").status, "unknown");
  });
});

test("clis: names the CLIs the platform needs that do not run", () => {
  withFixture({}, (f) => {
    mkdirSync(join(f.configDir, "demo"));
    writeFileSync(join(f.configDir, "demo", "config.yml"), GITHUB);
    const asked: string[] = [];
    const result = probe(f, "cli-path", (command) => {
      asked.push(command);
      return command !== "gh";
    });
    assert.deepEqual(asked.sort(), ["gh", "git", "node"]);
    assert.deepEqual(result, { status: "missing", findings: ["not found on PATH: gh"] });
  });
});

test("buildSetupState runs each check through its probe, in registry order", () => {
  withFixture({}, (f) => {
    const checks: SetupCheck[] = [
      { id: "b", title: "B", area: "project", scope: "project", probe: "git-top-level", preflight: false, explain: "x", handoff: "new-project-workflow" },
      { id: "a", title: "A", area: "machine", scope: "global", probe: "machine-kind", preflight: false, explain: "x", fix: { kind: "env-hint", variable: "NERDWAY_MACHINE" } },
    ];
    const state = buildSetupState(context(f), checks);
    assert.deepEqual(state.checks.map((check) => [check.id, check.status]), [["b", "ok"], ["a", "ok"]]);
  });
});

test("preflight: undetermined outside a repo, incomplete without a platform, ready once configured", () => {
  withFixture({ git: false }, (f) => {
    assert.equal(preflightSummary(buildSetupState(context(f), core), "issue-writer").status, "undetermined");
  });
  withFixture({}, (f) => {
    const vault = join(f.root, "wiki");
    mkdirSync(join(vault, "entities"), { recursive: true });
    wikiAt(f, vault);
    const before = preflightSummary(buildSetupState(context(f), core), "issue-writer");
    assert.equal(before.status, "incomplete");
    assert.equal(before.caller, "issue-writer");
    assert.ok(before.blocking.length > 0);
    assert.ok(before.blocking.every((check) => check.preflight && check.status === "missing"));

    mkdirSync(join(f.configDir, "demo"));
    writeFileSync(join(f.configDir, "demo", "config.yml"), GITHUB);
    const after = preflightSummary(buildSetupState(context(f), core), "issue-writer");
    assert.equal(after.status, "ready");
    assert.deepEqual(after.blocking, []);
    assert.deepEqual(after.projectConfig, { strategy: "user", path: join(f.configDir, "demo", "config.yml"), exists: true });
  });
});

test("nothing user-side: config paths resolve only under the config dir or the project repo, never the plugin", () => {
  withFixture({}, (f) => {
    const inside = (path: string, root: string) => path === root || path.startsWith(root + sep);
    for (const strategy of ["user", "repo"] as const) {
      if (strategy === "repo") {
        mkdirSync(join(f.repo, ".nerdway"));
        writeFileSync(join(f.repo, ".nerdway", "config.yml"), GITHUB);
      }
      const state = buildSetupState(context(f), core);
      for (const path of [state.globalConfig.path, state.projectConfig.path]) {
        assert.ok(inside(path, f.configDir) || inside(path, f.repo), `${strategy}: ${path}`);
        assert.ok(!inside(path, pluginRoot), `${strategy}: ${path} is inside the plugin`);
      }
      assert.equal(state.projectConfig.strategy, strategy);
    }
  });
});

test("wiki-root: a path from the environment says the variable overrides the file", () => {
  withFixture({}, (f) => {
    const vault = join(f.root, "vault");
    mkdirSync(join(vault, "wiki", "entities"), { recursive: true });
    f.env.NERDWAY_WIKI = vault;
    const result = probe(f, "wiki-dir");
    assert.equal(result.status, "warn");
    assert.match(result.findings.join("\n"), /overrides the config file/);
  });
});

test("preflight on a fresh machine: no global config and no wiki is incomplete, the wiki blocking", () => {
  withFixture({}, (f) => {
    const summary = preflightSummary(buildSetupState(context(f), core), "issue-writer");
    assert.equal(summary.status, "incomplete");
    assert.ok(summary.blocking.some((check) => check.probe === "wiki-dir"));
    assert.ok(summary.warnings.some((check) => check.probe === "defaults-file"));
  });
});
