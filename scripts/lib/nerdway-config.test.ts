import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { mergePlatformConfigs, migrateLegacyPlatform, readPlatformConfig, resolveConfigDir, resolveSlug, resolveVault } from "./nerdway-config.ts";
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

function optionsOf(repo: string, extra: { gitRemote?: (dir: string) => string } = {}) {
  return {
    vocabulary,
    trackerAdapters: adapters,
    gitRemote: extra.gitRemote ?? (() => ""),
    home: repo,
    platform: "linux" as const,
  };
}

function readOf(repo: string, env: NodeJS.ProcessEnv, extra: { gitRemote?: (dir: string) => string } = {}) {
  return readPlatformConfig(repo, env, optionsOf(repo, extra));
}

const LEGACY = "## Platform\n\n```yaml\ntracker: github\nvcs: github\ngithub:\n  owner: nerdway\n  repo: nerdway\n```\n";

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

function resolvedSidecar(configDir: string, slug = "repo"): string {
  return join(configDir, slug, "legacy-platform.resolved");
}

test("clear-case migration writes, reads back, and leaves CLAUDE.md byte-identical", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-migrate-clear-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    const original = `# Repo\n\nKeep this.\n\n${LEGACY}\n## Other\n\nbody\n`;
    writeFileSync(join(repo, "CLAUDE.md"), original);
    const result = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(result.status, "migrated");
    if (result.status !== "migrated") return;
    assert.equal(existsSync(join(configDir, "repo", "config.yml")), true);
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), original);
    const read = readOf(repo, env);
    assert.equal(read.status, "found");
    if (read.status !== "found") return;
    assert.deepEqual(read.value, { tracker: "github", vcs: "github", github: { owner: "nerdway", repo: "nerdway" } });
    const second = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(second.status, "stale");
    if (second.status !== "stale") return;
    assert.equal(second.path, result.path);
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), original);
    assert.equal(existsSync(resolvedSidecar(configDir)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clear-case migration leaves a section-only CLAUDE.md byte-identical", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-migrate-keep-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    const result = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(result.status, "migrated");
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY);
    assert.equal(existsSync(join(configDir, "repo", "config.yml")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("conflict when the project config differs writes nothing and reports", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-migrate-conflict-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "repo", "config.yml"), "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n");
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    const result = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(result.status, "conflict");
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY);
    assert.equal(existsSync(resolvedSidecar(configDir)), false);
    const read = readOf(repo, env);
    assert.equal(read.status, "migration-needed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unreadable legacy section writes nothing and reports", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-migrate-bad-"));
  try {
    const { env, repo } = configEnv(root);
    writeFileSync(join(repo, "CLAUDE.md"), "## Platform\n\nprose only\n");
    const result = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(result.status, "conflict");
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8").includes("## Platform"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ambiguous slug writes nothing and reports", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-migrate-slug-"));
  try {
    const { env, repo } = configEnv(root);
    writeFileSync(join(repo, ".nerdbrain-slug"), "!!!\n");
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    const result = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(result.status, "conflict");
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--resolve keep-user, take-repo and merge write a fingerprint and leave CLAUDE.md untouched", () => {
  const cases = [
    {
      choice: "keep-user" as const,
      owner: "acme",
      next: "stale-differs" as const,
    },
    {
      choice: "take-repo" as const,
      owner: "nerdway",
      next: "stale" as const,
    },
    {
      choice: "merge" as const,
      owner: "acme",
      next: "stale-differs" as const,
    },
  ];
  for (const item of cases) {
    const root = mkdtempSync(join(tmpdir(), `nerdway-resolve-${item.choice}-`));
    try {
      const { env, repo, configDir } = configEnv(root);
      mkdirSync(join(configDir, "repo"));
      const userConfig = "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n";
      writeFileSync(join(configDir, "repo", "config.yml"), userConfig);
      writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
      const result = migrateLegacyPlatform(repo, env, { ...optionsOf(repo), resolve: item.choice });
      assert.equal(result.status, item.next, item.choice);
      assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY, item.choice);
      const sidecar = readFileSync(resolvedSidecar(configDir), "utf8").trim();
      assert.match(sidecar, /^[0-9a-f]{64}$/, item.choice);
      const read = readOf(repo, env);
      assert.equal(read.status, "found", item.choice);
      if (read.status !== "found") return;
      assert.equal((read.value.github as { owner: string }).owner, item.owner, item.choice);
      const again = migrateLegacyPlatform(repo, env, optionsOf(repo));
      assert.equal(again.status, item.next, `${item.choice} next run`);
      assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY, `${item.choice} next CLAUDE.md`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("editing the leftover section after --resolve asks again", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-resolve-reedit-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "repo", "config.yml"), "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n");
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    const resolved = migrateLegacyPlatform(repo, env, { ...optionsOf(repo), resolve: "keep-user" });
    assert.equal(resolved.status, "stale-differs");
    const edited = "## Platform\n\n```yaml\ntracker: github\nvcs: github\ngithub:\n  owner: other\n  repo: nerdway\n```\n";
    writeFileSync(join(repo, "CLAUDE.md"), edited);
    const again = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(again.status, "conflict");
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), edited);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unreadable resolution fingerprint treats a difference as unresolved", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-resolve-bad-fp-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "repo", "config.yml"), "tracker: github\nvcs: github\ngithub:\n  owner: acme\n  repo: app\n");
    writeFileSync(join(repo, "CLAUDE.md"), LEGACY);
    writeFileSync(resolvedSidecar(configDir), "not-a-fingerprint\n");
    const result = migrateLegacyPlatform(repo, env, optionsOf(repo));
    assert.equal(result.status, "conflict");
    assert.equal(readFileSync(join(repo, "CLAUDE.md"), "utf8"), LEGACY);
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

function vaultOf(repo: string, env: NodeJS.ProcessEnv, extra: { home?: string; platform?: NodeJS.Platform; cwd?: string } = {}) {
  return resolveVault(repo, env, { home: extra.home ?? repo, platform: extra.platform ?? "linux", gitRemote: () => "", ...extra });
}

test("resolveVault: NERDWAY_WIKI wins over NERDBRAIN_VAULT, config and the default", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-env-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: /from-defaults\n");
    writeFileSync(join(configDir, "repo", "config.yml"), "wiki:\n  path: /from-project\n");
    const wiki = join(root, "from-env");
    mkdirSync(wiki);
    const result = vaultOf(repo, { ...env, NERDWAY_WIKI: wiki, NERDBRAIN_VAULT: join(root, "legacy") });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, wiki);
    assert.equal(result.source, "env");
    assert.equal(result.exists, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: NERDBRAIN_VAULT is the legacy env after NERDWAY_WIKI", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-legacy-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: /from-defaults\n");
    const legacy = join(root, "legacy-vault");
    const result = vaultOf(repo, { ...env, NERDBRAIN_VAULT: legacy });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, legacy);
    assert.equal(result.source, "env");
    assert.equal(result.exists, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: project wiki.path wins over defaults and the implicit default", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-project-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: /from-defaults\n");
    writeFileSync(join(configDir, "repo", "config.yml"), "wiki:\n  path: /from-project\n");
    const result = vaultOf(repo, env);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, "/from-project");
    assert.equal(result.source, "project");
    assert.equal(result.exists, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: defaults wiki.path wins over the implicit default", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-defaults-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: /from-defaults\n");
    const result = vaultOf(repo, env);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, "/from-defaults");
    assert.equal(result.source, "defaults");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: implicit default is <configDir>/wiki and is not created", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-default-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    const result = vaultOf(repo, env);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, join(configDir, "wiki"));
    assert.equal(result.source, "default");
    assert.equal(result.exists, false);
    assert.equal(existsSync(join(configDir, "wiki")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: expands ~ in wiki.path against home", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-tilde-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: ~/obsidian/custom\n");
    const home = join(root, "home");
    const result = vaultOf(repo, env, { home });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, join(home, "obsidian", "custom"));
    assert.equal(result.source, "defaults");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: a relative wiki.path is resolved against configDir", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-rel-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: notes/wiki\n");
    const result = vaultOf(repo, env);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, join(configDir, "notes", "wiki"));
    assert.equal(result.source, "defaults");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: a non-string wiki.path is invalid", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-type-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path:\n    nested: x\n");
    const result = vaultOf(repo, env);
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") return;
    assert.match(result.errors[0], /wiki\.path must be a string/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: wiki as a scalar is invalid", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-wiki-scalar-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki: /tmp/wiki\n");
    const result = vaultOf(repo, env);
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") return;
    assert.match(result.errors[0], /wiki must be an object/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: default on Windows is %APPDATA%\\nerdway\\wiki", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-win-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const appdata = join(root, "AppData", "Roaming");
    const result = vaultOf(
      repo,
      { APPDATA: appdata },
      { platform: "win32", home: join(root, "Users", "dev") },
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, join(appdata, "nerdway", "wiki"));
    assert.equal(result.source, "default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveVault: empty NERDWAY_WIKI falls through to the next source", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vault-empty-env-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "wiki:\n  path: /from-defaults\n");
    const result = vaultOf(repo, { ...env, NERDWAY_WIKI: "  ", NERDBRAIN_VAULT: "" });
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.path, "/from-defaults");
    assert.equal(result.source, "defaults");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


