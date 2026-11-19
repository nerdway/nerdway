import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findProjectByChannel, readSlackConfig } from "./slack-config.ts";
import { writeSection } from "./config-sections.ts";

function layout(prefix: string): { root: string; env: NodeJS.ProcessEnv; repo: string; configDir: string } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const configDir = join(root, "config");
  mkdirSync(configDir);
  return { root, repo, configDir, env: { NERDWAY_CONFIG_DIR: configDir } };
}

function io(repo: string, env: NodeJS.ProcessEnv) {
  return { repoRoot: repo, env, gitRemote: () => "" };
}

test("the project channel and the default owner merge", () => {
  const { root, repo, configDir, env } = layout("nerdway-slack-merge-");
  try {
    writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
    mkdirSync(join(configDir, "demo"));
    writeFileSync(join(configDir, "config.yml"), "slack:\n  owner: U0123456789\n  autonomous: true\n");
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  channel: C0123456789\n");
    const read = readSlackConfig("demo", io(repo, env));
    assert.equal(read.status, "found");
    assert.deepEqual(read.value, {
      owner: "U0123456789",
      channel: "C0123456789",
      autonomous: true,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ambiguous channel is an error", () => {
  const { root, configDir } = layout("nerdway-slack-amb-");
  try {
    mkdirSync(join(configDir, "one"));
    mkdirSync(join(configDir, "two"));
    writeFileSync(join(configDir, "one", "config.yml"), "slack:\n  channel: C0123456789\n");
    writeFileSync(join(configDir, "two", "config.yml"), "slack:\n  channel: C0123456789\n");
    const found = findProjectByChannel(configDir, "C0123456789");
    assert.equal(found.status, "ambiguous");
    if (found.status === "ambiguous") assert.deepEqual(found.slugs, ["one", "two"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown channel is absent", () => {
  const { root, configDir } = layout("nerdway-slack-absent-");
  try {
    mkdirSync(join(configDir, "demo"));
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  channel: C0123456789\n");
    assert.deepEqual(findProjectByChannel(configDir, "C9999999999"), { status: "absent" });
    assert.deepEqual(findProjectByChannel(join(configDir, "missing"), "C0123456789"), { status: "absent" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bad IDs fail the schema pattern", () => {
  const { root, repo, configDir, env } = layout("nerdway-slack-bad-id-");
  try {
    writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
    mkdirSync(join(configDir, "demo"));
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  owner: user-name\n");
    const owner = readSlackConfig("demo", io(repo, env));
    assert.equal(owner.status, "invalid");
    assert.match(owner.errors[0] ?? "", /slack\.owner/);
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  channel: general\n");
    const channel = readSlackConfig("demo", io(repo, env));
    assert.equal(channel.status, "invalid");
    assert.match(channel.errors[0] ?? "", /slack\.channel/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("`autonomous` defaults to false", () => {
  const { root, repo, configDir, env } = layout("nerdway-slack-auto-");
  try {
    writeFileSync(join(repo, ".nerdbrain-slug"), "demo\n");
    mkdirSync(join(configDir, "demo"));
    writeFileSync(join(configDir, "config.yml"), "slack:\n  owner: U0123456789\n");
    writeFileSync(join(configDir, "demo", "config.yml"), "slack:\n  channel: C0123456789\n");
    const read = readSlackConfig("demo", io(repo, env));
    assert.equal(read.status, "found");
    assert.equal(read.value?.autonomous, false);
    const written = writeSection("slack", { owner: "U0123456789" }, {
      ...io(repo, env),
      target: "defaults",
    });
    assert.equal(written.status, "ok");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
