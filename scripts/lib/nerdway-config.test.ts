import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolveConfigDir, resolveSlug } from "./nerdway-config.ts";

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

