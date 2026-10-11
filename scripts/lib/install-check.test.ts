import { test } from "node:test";
import assert from "node:assert/strict";

import { detectVersionDrift, fetchMainVersion, findStaleSkillCopies, renderHookOutput } from "./install-check.ts";

const CURRENT_SKILLS = ["issue-workflow", "nerdbrain-wiki", "tdd"];

function skillMd(name: string, body: string): string {
  return `---\nname: ${name}\ndescription: whatever\n---\n\n${body}\n`;
}

test("detectVersionDrift reports an installed version lower than main", () => {
  assert.deepEqual(detectVersionDrift("0.45.0", "0.51.0"), {
    kind: "version-drift",
    installed: "0.45.0",
    main: "0.51.0",
  });
});

test("detectVersionDrift stays silent when installed equals main", () => {
  assert.equal(detectVersionDrift("0.54.0", "0.54.0"), null);
});

test("detectVersionDrift stays silent when installed is ahead of main (working tree, branch)", () => {
  assert.equal(detectVersionDrift("0.55.0", "0.54.0"), null);
});

test("detectVersionDrift stays silent when main is unknown", () => {
  assert.equal(detectVersionDrift("0.54.0", null), null);
});

test("findStaleSkillCopies flags a directory whose SKILL.md carries a historical plugin skill name", () => {
  const entries = [
    { path: "/home/u/.agents/skills/linear-issue-workflow", text: skillMd("linear-issue-workflow", "Drive a Linear issue.") },
  ];
  assert.deepEqual(findStaleSkillCopies(entries, CURRENT_SKILLS), [
    { kind: "stale-skill-copy", path: "/home/u/.agents/skills/linear-issue-workflow", name: "linear-issue-workflow" },
  ]);
});

test("findStaleSkillCopies flags a current skill name only when the file mentions nerd4rent or nerdbrain", () => {
  const entries = [
    { path: "/home/u/.agents/skills/nerdbrain-wiki", text: skillMd("nerdbrain-wiki", "Write the nerdbrain entity page.") },
    { path: "/home/u/.agents/skills/tdd", text: skillMd("tdd", "Red, green, refactor.") },
    { path: "/home/u/.agents/skills/issue-workflow", text: skillMd("issue-workflow", "Call nerd4rent:issue-start.") },
  ];
  assert.deepEqual(findStaleSkillCopies(entries, CURRENT_SKILLS), [
    { kind: "stale-skill-copy", path: "/home/u/.agents/skills/nerdbrain-wiki", name: "nerdbrain-wiki" },
    { kind: "stale-skill-copy", path: "/home/u/.agents/skills/issue-workflow", name: "issue-workflow" },
  ]);
});

test("findStaleSkillCopies ignores unrelated skills and files without a frontmatter name", () => {
  const entries = [
    { path: "/home/u/.claude/skills/pdf", text: skillMd("pdf", "Read PDFs for nerd4rent clients.") },
    { path: "/home/u/.claude/skills/broken", text: "no frontmatter here, nerdbrain mentioned" },
  ];
  assert.deepEqual(findStaleSkillCopies(entries, CURRENT_SKILLS), []);
});

const DRIFT = { kind: "version-drift", installed: "0.45.0", main: "0.51.0" } as const;
const COPY = { kind: "stale-skill-copy", path: "/home/u/.agents/skills/linear-issue-workflow", name: "linear-issue-workflow" } as const;

test("renderHookOutput wraps a version drift in the Claude Code SessionStart envelope with the update commands", () => {
  const out = JSON.parse(renderHookOutput([DRIFT], "claude", "/home/u/.claude/plugins/cache/nerd4rent-claude-plugin/nerd4rent/0.45.0"));
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.systemMessage, /nerd4rent plugin 0\.45\.0 is installed, main is 0\.51\.0/);
  assert.match(out.systemMessage, /\/plugin marketplace update nerd4rent-claude-plugin/);
  assert.match(out.systemMessage, /\/plugin update nerd4rent@nerd4rent-claude-plugin/);
  assert.match(out.hookSpecificOutput.additionalContext, /^Repeat the following warning to the user verbatim in your first reply/);
  assert.ok(out.hookSpecificOutput.additionalContext.includes(out.systemMessage));
});

test("renderHookOutput tells a Cursor local clone to fast-forward itself", () => {
  const out = JSON.parse(renderHookOutput([DRIFT], "cursor", "/home/u/.cursor/plugins/local/nerd4rent"));
  assert.equal(Object.keys(out).join(","), "additional_context");
  assert.match(out.additional_context, /^Repeat the following warning to the user verbatim in your first reply/);
  assert.match(out.additional_context, /git -C \/home\/u\/\.cursor\/plugins\/local\/nerd4rent pull --ff-only/);
});

test("renderHookOutput tells a Cursor marketplace install to re-add the marketplace and reinstall the card", () => {
  const out = JSON.parse(renderHookOutput([DRIFT], "cursor", "/home/u/.cursor/plugins/cache/nerd4rent/abc"));
  assert.match(out.additional_context, /agent plugin marketplace remove nerd4rent-claude-plugin/);
  assert.match(out.additional_context, /agent plugin marketplace add nerd4rent\/nerd4rent-claude-plugin/);
  assert.match(out.additional_context, /Customize/);
});

test("renderHookOutput names a stale copy by path and asks to remove it, one line per finding", () => {
  const out = JSON.parse(renderHookOutput([DRIFT, COPY], "claude", "/plugin"));
  const lines = out.systemMessage.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^stale copy of the nerd4rent skill linear-issue-workflow at \/home\/u\/\.agents\/skills\/linear-issue-workflow: remove it/);
});

test("renderHookOutput prints nothing when there is nothing to report", () => {
  assert.equal(renderHookOutput([], "claude", "/plugin"), "");
  assert.equal(renderHookOutput([], "cursor", "/plugin"), "");
});

test("fetchMainVersion returns null when the network call rejects", async () => {
  const unreachable = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(await fetchMainVersion(unreachable as unknown as typeof fetch), null);
});

test("fetchMainVersion returns null on a non-2xx response or a manifest without a version", async () => {
  const notFound = async () => new Response("not found", { status: 404 });
  const noVersion = async () => new Response(JSON.stringify({ name: "nerd4rent" }), { status: 200 });
  assert.equal(await fetchMainVersion(notFound as unknown as typeof fetch), null);
  assert.equal(await fetchMainVersion(noVersion as unknown as typeof fetch), null);
});

test("fetchMainVersion reads the version of the raw main manifest", async () => {
  let requested = "";
  const ok = async (url: string | URL | Request) => {
    requested = String(url);
    return new Response(JSON.stringify({ name: "nerd4rent", version: "0.51.0" }), { status: 200 });
  };
  assert.equal(await fetchMainVersion(ok as unknown as typeof fetch), "0.51.0");
  assert.equal(requested, "https://raw.githubusercontent.com/nerd4rent/nerd4rent-claude-plugin/main/.claude-plugin/plugin.json");
});
