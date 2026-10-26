import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { enforceBudget, projectDirectory, renderSession, trimPage, type SessionOptions } from "./session-start.ts";

const ALWAYS_PAGE = [
  "preamble\n",
  "## Purpose\n",
  "why\n",
  "## Gotchas\n",
  "watch this\n",
  "## Stack\n",
  "node\n",
  "## Decisions\n",
  "old\n",
].join("");

function options(root: string, projectDir: string, extra: Partial<SessionOptions> = {}): SessionOptions {
  return {
    vault: join(root, "vault"),
    aliasesPath: join(root, "aliases"),
    killSwitchPath: join(root, "kill"),
    budget: 8192,
    projectDir,
    gitRemote: () => "",
    ...extra,
  };
}

function contextOf(output: string): string {
  assert.equal(output.startsWith('{"additional_context": "'), true);
  assert.equal(output.endsWith("\n"), true);
  const parsed: unknown = JSON.parse(output);
  assert.equal(typeof parsed, "object");
  assert.equal(parsed !== null, true);
  const record = parsed as { additional_context: unknown };
  assert.equal(typeof record.additional_context, "string");
  return record.additional_context;
}

test("trimPage keeps the whitelist and names every other section", () => {
  const path = "/vault/5-wiki/entities/projects/demo.md";
  const trimmed = trimPage(ALWAYS_PAGE, path);
  assert.equal(trimmed.includes("## Purpose\n"), true);
  assert.equal(trimmed.includes("## Stack\n"), true);
  assert.equal(trimmed.includes("## Gotchas"), false);
  assert.equal(trimmed.includes("## Decisions"), false);
  assert.equal(
    trimmed.includes(
      `[omitted: Gotchas, Decisions — read ${path} before debugging or when a decision's rationale matters]`,
    ),
    true,
  );
});

test("enforceBudget leaves a short page intact and drops a cut-off byte", () => {
  const path = "/page.md";
  assert.equal(enforceBudget("abc", 10, path), "abc");
  const marker = `\n[truncated — read full page: ${path}]\n`;
  const budget = Buffer.byteLength(marker) + 6;
  const cut = enforceBudget(`${"x".repeat(5)}ł${"y".repeat(Buffer.byteLength(marker))}`, budget, path);
  assert.equal(cut.startsWith("xxxxx"), true);
  assert.equal(cut.includes("ł"), false);
  assert.equal(cut.includes("\uFFFD"), false);
  assert.equal(cut.endsWith(marker), true);
});

test("a kill switch or a project inside the vault injects nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    const project = join(root, "project");
    mkdirSync(project);
    writeFileSync(join(root, "kill"), "");
    assert.equal(contextOf(renderSession(options(root, project))), "");

    rmSync(join(root, "kill"));
    writeFileSync(join(project, ".nerdbrain-disabled"), "");
    assert.equal(contextOf(renderSession(options(root, project))), "");

    rmSync(join(project, ".nerdbrain-disabled"));
    const vault = join(root, "vault");
    const inside = join(vault, "notes");
    mkdirSync(inside, { recursive: true });
    assert.equal(contextOf(renderSession(options(root, inside))), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("slug comes from the slug file, else the remote, else the directory name", () => {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    const project = join(root, "My Project");
    mkdirSync(project);
    writeFileSync(join(project, ".nerdbrain-slug"), "Git Hub/Slug!!!\nsecond\n");
    const fromFile = contextOf(renderSession(options(root, project)));
    assert.equal(fromFile.includes("slug: `itublug`"), true);

    rmSync(join(project, ".nerdbrain-slug"));
    writeFileSync(join(root, "aliases"), "github.com=gh\n");
    const fromRemote = contextOf(
      renderSession(options(root, project, { gitRemote: () => "git@github.com:Nerd4Rent/Plugin.git" })),
    );
    assert.equal(fromRemote.includes("slug: `gh-nerd4rent-plugin`"), true);

    const fromDir = contextOf(renderSession(options(root, project, { gitRemote: () => "" })));
    assert.equal(fromDir.includes("slug: `myproject`"), true);
    assert.equal(fromDir.includes("tier: `none`"), true);
    assert.equal(fromDir.includes("## Project not yet in nerdbrain wiki"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an existing page is trimmed into the inject and a missing vault stays a stub", () => {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    const project = join(root, "demo");
    const vault = join(root, "vault");
    mkdirSync(join(vault, "5-wiki", "entities", "projects"), { recursive: true });
    mkdirSync(project);
    writeFileSync(join(project, ".nerdbrain-slug"), "demo\n");
    writeFileSync(join(vault, "5-wiki", "entities", "projects", "demo.md"), ALWAYS_PAGE);
    const page = contextOf(renderSession(options(root, project)));
    assert.equal(page.includes("tier: `file`"), true);
    assert.equal(page.includes("## Project page from nerdbrain wiki"), true);
    assert.equal(page.includes("## Purpose"), true);
    assert.equal(page.includes("## Gotchas"), false);
    assert.equal(page.includes("[omitted: Gotchas, Decisions — read "), true);
    assert.equal(page.includes("nerdbrain-wiki"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("projectDirectory prefers the first workspace root", () => {
  assert.equal(projectDirectory('{"workspace_roots":["/work/app"]}', "/other"), "/work/app");
  assert.equal(projectDirectory("", "/other"), "/other");
  assert.equal(projectDirectory("not-json", "/other"), "/other");
  assert.equal(projectDirectory('{"workspace_roots":[]}', "/other"), "/other");
});

test("projectDirectory takes the Claude Code cwd before any workspace root", () => {
  assert.equal(projectDirectory('{"cwd":"/claude/app"}', "/other"), "/claude/app");
  assert.equal(projectDirectory('{"cwd":"/claude/app","workspace_roots":["/work/app"]}', "/other"), "/claude/app");
  assert.equal(projectDirectory('{"cwd":""}', "/other"), "/other");
});

test("the script reads stdin and writes the stub for a project with no page", () => {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    const project = join(root, "demo");
    mkdirSync(project);
    const result = spawnSync(process.execPath, ["hooks/session-start.ts"], {
      input: JSON.stringify({ workspace_roots: [project] }),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: root,
        NERDBRAIN_VAULT: join(root, "missing-vault"),
        NERDBRAIN_ALIASES: join(root, "aliases"),
        NERDBRAIN_INJECT_BUDGET: "8192",
      },
    });
    assert.equal(result.status, 0);
    const text = contextOf(result.stdout);
    assert.equal(text.includes("slug: `demo`"), true);
    assert.equal(text.includes("tier: `none`"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
