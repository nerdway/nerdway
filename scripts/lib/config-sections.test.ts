import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createSectionRegistry,
  defineSection,
  extractSection,
  getSection,
  hasSection,
  listSections,
  readSection,
  registerSection,
  unknownSectionNotices,
  validateKnownSections,
  writeSection,
} from "./config-sections.ts";
import type { PlatformVocabulary } from "../types/platform-config.ts";
import { parseConfig } from "./yaml.ts";

const vocabulary: PlatformVocabulary = {
  trackers: ["linear", "github", "none"],
  vcs: ["github", "gitlab"],
  strategies: ["native", "label", "comment"],
  phases: ["backlog", "todo", "in-progress", "in-review", "done"],
};

const context = { vocabulary, trackerAdapter: undefined };

const demoSection = () =>
  defineSection({
    id: "demo",
    scope: "extension",
    description: "Test-only extension section",
    schema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
      additionalProperties: false,
    },
  });

function configEnv(root: string): { env: NodeJS.ProcessEnv; repo: string; configDir: string } {
  const repo = join(root, "repo");
  mkdirSync(repo);
  const configDir = join(root, "config");
  mkdirSync(configDir);
  return { env: { NERDWAY_CONFIG_DIR: configDir }, repo, configDir };
}

test("platform presence is any platform key, not wiki or pr or an unknown section", () => {
  assert.equal(hasSection("platform", { wiki: { path: "/v" } }), false);
  assert.equal(hasSection("platform", { pr: { collapse_details: false } }), false);
  assert.equal(hasSection("platform", { custom: { a: 1 } }), false);
  assert.equal(hasSection("platform", { tracker: "github" }), true);
  assert.equal(hasSection("platform", { github: { owner: "x" } }), true);
});

test("extractSection keeps only registered platform keys", () => {
  assert.deepEqual(extractSection("platform", { tracker: "github", wiki: { path: "/v" }, custom: 1 }), { tracker: "github" });
});

test("unknown sections are notices, never errors, and suggest extensions:", () => {
  const raw = {
    tracker: "github",
    vcs: "github",
    custom: { token: "x" },
  };
  const { errors, notices } = validateKnownSections(raw, context);
  assert.deepEqual(errors, []);
  assert.deepEqual(notices, ["unknown section custom; use extensions: for third-party settings"]);
});

test("unknownSectionNotices can name the file", () => {
  assert.deepEqual(unknownSectionNotices({ extra: 1 }, "config.yml"), [
    "config.yml: unknown section extra; use extensions: for third-party settings",
  ]);
});

test("unregistered extensions.id is a notice and a non-map extensions is an error", () => {
  const notices = validateKnownSections(
    { tracker: "github", vcs: "github", extensions: { demo: { enabled: true } } },
    context,
  );
  assert.deepEqual(notices.errors, []);
  assert.deepEqual(notices.notices, ["extensions.demo: no section registered"]);
  const bad = validateKnownSections({ tracker: "github", vcs: "github", extensions: "nope" }, context);
  assert.deepEqual(bad.errors, ["extensions must be a map"]);
});

test("the built-in registry lists platform, wiki, pr and slack and is frozen", () => {
  assert.deepEqual(
    listSections().map((section) => section.id),
    ["platform", "wiki", "pr", "slack"],
  );
  assert.equal(getSection("wiki")?.scope, "core");
  assert.equal(getSection("slack")?.scope, "core");
  assert.throws(() => registerSection(demoSection()), /frozen/);
});

test("registration rejects duplicate ids, key collisions, extensions on core, bad extension ids and validate on an extension", () => {
  const registry = createSectionRegistry();
  assert.throws(() => registry.registerSection(defineSection({ id: "wiki", scope: "core", keys: ["other"], schema: { type: "object" }, description: "dup" })), /already registered/);
  assert.throws(
    () => registry.registerSection(defineSection({ id: "extra", scope: "core", keys: ["wiki"], schema: { type: "object" }, description: "collision" })),
    /collides on key wiki/,
  );
  assert.throws(
    () => registry.registerSection(defineSection({ id: "exts", scope: "core", keys: ["extensions"], schema: { type: "object" }, description: "reserved" })),
    /reserved key extensions/,
  );
  assert.throws(() => defineSection({ id: "Demo", scope: "extension", schema: { type: "object" }, description: "bad id" }), /must match/);
  assert.throws(
    () => defineSection({ id: "demo", scope: "extension", schema: { type: "object" }, description: "fn", validate: () => [] }),
    /may not have a validate function/,
  );
  assert.throws(
    () => defineSection({ id: "demo", scope: "extension", schema: { oneOf: [] } as never, description: "bad schema" }),
    /unsupported keyword oneOf/,
  );
});

test("createSectionRegistry starts from built-ins and stays mutable", () => {
  const registry = createSectionRegistry();
  registry.registerSection(demoSection());
  assert.equal(registry.getSection("demo")?.scope, "extension");
  assert.equal(getSection("demo"), undefined);
});

test("read/write isolation: writing extensions.demo keeps comments, wiki, platform and other extensions", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-section-iso-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    const original = [
      "# keep me",
      "wiki:",
      "  path: /vault # vault",
      "tracker: github",
      "vcs: github",
      "github:",
      "  owner: acme",
      "  repo: app",
      "extensions:",
      "  other:",
      "    n: 1",
      "  demo:",
      "    enabled: false",
      "",
    ].join("\n");
    writeFileSync(join(configDir, "repo", "config.yml"), original);
    const registry = createSectionRegistry();
    registry.registerSection(demoSection());
    const written = writeSection("demo", { enabled: true }, {
      repoRoot: repo,
      env,
      target: "project",
      registry,
      gitRemote: () => "",
      vocabulary,
      trackerAdapters: new Map(),
    });
    assert.equal(written.status, "ok");
    const text = readFileSync(join(configDir, "repo", "config.yml"), "utf8");
    assert.match(text, /# keep me/);
    assert.match(text, /path: \/vault # vault/);
    assert.match(text, /tracker: github/);
    assert.match(text, /owner: acme/);
    assert.match(text, /other:\n    n: 1/);
    const value = parseConfig(text).value;
    assert.deepEqual(value?.wiki, { path: "/vault" });
    assert.deepEqual((value?.extensions as { demo: unknown }).demo, { enabled: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a test-only extension section registered in a fresh registry round-trips", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-section-rt-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    const registry = createSectionRegistry();
    registry.registerSection(demoSection());
    const written = writeSection("demo", { enabled: true }, { repoRoot: repo, env, target: "defaults", registry, gitRemote: () => "" });
    assert.equal(written.status, "ok");
    const read = readSection("demo", { repoRoot: repo, env, registry, gitRemote: () => "" });
    assert.equal(read.status, "found");
    assert.deepEqual(read.value, { enabled: true });
    const onDisk = parseConfig(readFileSync(join(configDir, "config.yml"), "utf8")).value;
    assert.deepEqual(onDisk, { extensions: { demo: { enabled: true } } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readSection applies schema defaults and scopes errors to the section", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-section-defaults-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    writeFileSync(join(configDir, "config.yml"), "pr: {}\n");
    const found = readSection("pr", { repoRoot: repo, env, gitRemote: () => "" });
    assert.equal(found.status, "found");
    assert.deepEqual(found.value, { collapse_details: true });
    writeFileSync(join(configDir, "config.yml"), "pr:\n  collapse_details: yes\n");
    const invalid = readSection("pr", { repoRoot: repo, env, gitRemote: () => "" });
    assert.equal(invalid.status, "invalid");
    assert.match(invalid.errors[0], /pr\.collapse_details: expected boolean/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("slack is a built-in core section and keeps other sections intact on write", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-section-slack-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(configDir, "repo"));
    writeFileSync(
      join(configDir, "repo", "config.yml"),
      ["# keep me", "wiki:", "  path: /vault", "tracker: github", "vcs: github", "github:", "  owner: acme", "  repo: app", ""].join("\n"),
    );
    const slack = getSection("slack");
    assert.equal(slack?.scope, "core");
    assert.deepEqual(slack && "keys" in slack ? slack.keys : [], ["slack"]);
    const written = writeSection("slack", { channel: "C0123456789" }, {
      repoRoot: repo,
      env,
      target: "project",
      gitRemote: () => "",
      vocabulary,
      trackerAdapters: new Map(),
    });
    assert.equal(written.status, "ok");
    const text = readFileSync(join(configDir, "repo", "config.yml"), "utf8");
    assert.match(text, /# keep me/);
    assert.match(text, /path: \/vault/);
    assert.match(text, /tracker: github/);
    assert.match(text, /channel: C0123456789/);
    const value = parseConfig(text).value;
    assert.deepEqual(value?.wiki, { path: "/vault" });
    assert.deepEqual(value?.slack, { channel: "C0123456789" });
    assert.equal(value?.tracker, "github");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeSection validates before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-section-validate-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    const registry = createSectionRegistry();
    registry.registerSection(demoSection());
    const written = writeSection("demo", { enabled: "yes" }, { repoRoot: repo, env, target: "defaults", registry, gitRemote: () => "" });
    assert.equal(written.status, "invalid");
    assert.match(written.errors[0], /extensions\.demo\.enabled: expected boolean/);
    assert.equal(existsSync(join(configDir, "config.yml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sections read and write the repo-located project file when it exists", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-section-repo-"));
  try {
    const { env, repo, configDir } = configEnv(root);
    mkdirSync(join(repo, ".nerdway"));
    const path = join(repo, ".nerdway", "config.yml");
    writeFileSync(path, "# repo file\npr:\n  collapseDetails: true\n");
    const registry = createSectionRegistry();
    registry.registerSection(demoSection());
    const written = writeSection("demo", { enabled: true }, { repoRoot: repo, env, target: "project", registry, gitRemote: () => "" });
    assert.equal(written.status, "ok");
    assert.match(readFileSync(path, "utf8"), /# repo file/);
    assert.deepEqual(readSection("demo", { repoRoot: repo, env, registry, layer: "project", gitRemote: () => "" }).value, { enabled: true });
    assert.equal(existsSync(join(configDir, "repo")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
