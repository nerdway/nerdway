import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { mergePlatformConfigs, readPlatformConfig, resolveConfigDir, resolveSlug } from "./nerdway-config.ts";
import type { PlatformVocabulary } from "../types/platform-config.ts";

test("slug comes from the slug file, else the remote, else the directory name", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-slug-"));
  try {
    const project = join(root, "My Project");
    mkdirSync(project);
    writeFileSync(join(project, ".nerdbrain-slug"), "Git Hub/Slug!!!\nsecond\n");
    assert.equal(resolveSlug(project), "itublug");

    rmSync(join(project, ".nerdbrain-slug"));
    writeFileSync(join(root, "aliases"), "github.com=gh\n");
    assert.equal(
      resolveSlug(project, { aliasesPath: join(root, "aliases"), gitRemote: () => "git@github.com:nerdway/Plugin.git" }),
      "gh-nerdway-plugin",
    );

    assert.equal(resolveSlug(project, { gitRemote: () => "" }), "myproject");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("session-start and the config share one slug function", async () => {
  const session = await import("../../hooks/session-start.ts");
  const root = mkdtempSync(join(tmpdir(), "nerdway-shared-slug-"));
  try {
    const project = join(root, "demo");
    mkdirSync(project);
    writeFileSync(join(project, ".nerdbrain-slug"), "shared-slug\n");
    const slug = resolveSlug(project);
    assert.equal(slug, "shared-slug");
    const output = session.renderSession({
      vault: join(root, "vault"),
      aliasesPath: join(root, "aliases"),
      killSwitchPath: join(root, "kill"),
      budget: 8192,
      projectDir: project,
      gitRemote: () => "should-not-run",
    });
    assert.equal(output.includes("slug: `shared-slug`"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveConfigDir prefers NERDWAY_CONFIG_DIR over every other source", () => {
  const override = join("/custom", "nerdway-config");
  assert.equal(
    resolveConfigDir({ NERDWAY_CONFIG_DIR: override, XDG_CONFIG_HOME: "/xdg", APPDATA: "C:\\AppData" }, "linux", "/home/dev"),
    override,
  );
  assert.equal(
    resolveConfigDir({ NERDWAY_CONFIG_DIR: override, XDG_CONFIG_HOME: "/xdg", APPDATA: "C:\\AppData" }, "win32", "C:\\Users\\dev"),
    override,
  );
  assert.equal(
    resolveConfigDir({ NERDWAY_CONFIG_DIR: "  /tmp/nerdway  ", XDG_CONFIG_HOME: "/xdg" }, "darwin", "/Users/dev"),
    "/tmp/nerdway",
  );
});

test("resolveConfigDir uses XDG_CONFIG_HOME/nerdway when the override is unset", () => {
  assert.equal(
    resolveConfigDir({ XDG_CONFIG_HOME: "/xdg/config", APPDATA: "C:\\AppData" }, "linux", "/home/dev"),
    join("/xdg/config", "nerdway"),
  );
  assert.equal(
    resolveConfigDir({ XDG_CONFIG_HOME: "/xdg/config", APPDATA: "C:\\AppData" }, "win32", "C:\\Users\\dev"),
    join("/xdg/config", "nerdway"),
  );
});

test("resolveConfigDir uses ~/.config/nerdway on Linux and macOS without XDG", () => {
  assert.equal(resolveConfigDir({}, "linux", "/home/dev"), join("/home/dev", ".config", "nerdway"));
  assert.equal(resolveConfigDir({}, "darwin", "/Users/dev"), join("/Users/dev", ".config", "nerdway"));
});

test("resolveConfigDir uses %APPDATA%\\nerdway on Windows without XDG", () => {
  assert.equal(
    resolveConfigDir({ APPDATA: "C:\\Users\\dev\\AppData\\Roaming" }, "win32", "C:\\Users\\dev"),
    join("C:\\Users\\dev\\AppData\\Roaming", "nerdway"),
  );
});

test("resolveConfigDir ignores an empty NERDWAY_CONFIG_DIR and an empty XDG_CONFIG_HOME", () => {
  assert.equal(
    resolveConfigDir({ NERDWAY_CONFIG_DIR: "   ", XDG_CONFIG_HOME: "", APPDATA: "C:\\AppData" }, "win32", "C:\\Users\\dev"),
    join("C:\\AppData", "nerdway"),
  );
  assert.equal(resolveConfigDir({ NERDWAY_CONFIG_DIR: "", XDG_CONFIG_HOME: "  " }, "linux", "/home/dev"), join("/home/dev", ".config", "nerdway"));
});

const vocabulary: PlatformVocabulary = {
  trackers: ["linear", "github", "none"],
  vcs: ["github", "gitlab"],
  strategies: ["native", "label", "comment"],
  phases: ["backlog", "todo", "in-progress", "in-review", "done"],
};

const adapters = new Map<string, string>();

function configEnv(root: string): { env: NodeJS.ProcessEnv; repo: string; configDir: string } {
  const repo = join(root, "repo");
  mkdirSync(repo);
  const configDir = join(root, "config");
  mkdirSync(configDir);
  return { env: { NERDWAY_CONFIG_DIR: configDir }, repo, configDir };
}

function readOf(repo: string, env: NodeJS.ProcessEnv, extra: { gitRemote?: (dir: string) => string } = {}) {
  return readPlatformConfig(repo, env, {
    vocabulary,
    trackerAdapters: adapters,
    gitRemote: extra.gitRemote ?? (() => ""),
    home: repo,
    platform: "linux",
  });
}

test("mergePlatformConfigs: a project key replaces the default key whole; missing keys come from defaults", () => {
  const defaults = {
    tracker: "linear",
    vcs: "github",
    linear: { team: "DEMO", project: "uuid" },
    github: { owner: "acme", repo: "app" },
  };
  const project = {
    tracker: "github",
    github: { owner: "nerdway", repo: "nerdway" },
    statuses: { strategy: "label", map: { todo: "status::todo" } },
  };
  assert.deepEqual(mergePlatformConfigs(defaults, project), {
    tracker: "github",
    vcs: "github",
    linear: { team: "DEMO", project: "uuid" },
    github: { owner: "nerdway", repo: "nerdway" },
    statuses: { strategy: "label", map: { todo: "status::todo" } },
  });
});

test("resolves from user config", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-read-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "config.yml"), "tracker: linear\nvcs: github\nlinear:\n  team: DEMO\n");
    writeFileSync(join(configDir, "repo", "config.yml"), "tracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\n");
    const read = readOf(repo, env);
    assert.equal(read.status, "found");
    if (read.status !== "found") return;
    assert.deepEqual(read.value, {
      tracker: "github",
      vcs: "github",
      linear: { team: "DEMO" },
      github: { owner: "nerdway", repo: "nerdway" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readPlatformConfig: no config files is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-absent-"));
  try {
    const { env, repo } = configEnv(root);
    const read = readOf(repo, env);
    assert.equal(read.status, "absent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readPlatformConfig: a broken project file is invalid", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-invalid-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "repo", "config.yml"), "tracker: basecamp\nvcs: github\n");
    const read = readOf(repo, env);
    assert.equal(read.status, "invalid");
    assert.match(read.errors[0], /basecamp/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readPlatformConfig: a legacy ## Platform section is migration-needed", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-legacy-"));
  try {
    const { env, repo } = configEnv(root);
    writeFileSync(join(repo, "CLAUDE.md"), "## Platform\n\n```yaml\ntracker: github\nvcs: github\n```\n");
    const read = readOf(repo, env);
    assert.equal(read.status, "migration-needed");
    assert.ok(read.errors.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readPlatformConfig: defaults apply when the project file omits a key", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-defaults-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "config.yml"), "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n");
    writeFileSync(join(configDir, "repo", "config.yml"), "vcs: gitlab\n");
    const read = readOf(repo, env);
    assert.equal(read.status, "found");
    if (read.status !== "found") return;
    assert.equal(read.value.tracker, "github");
    assert.equal(read.value.vcs, "gitlab");
    assert.deepEqual(read.value.github, { owner: "acme", repo: "app" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


