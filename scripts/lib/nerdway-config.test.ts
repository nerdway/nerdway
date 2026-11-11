import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolveSlug } from "./nerdway-config.ts";

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
