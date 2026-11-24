import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkById, checkErrors, loadCoreChecks, mergeChecks, validateRegistry, type SetupCheck } from "./setup-checks.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const context = { skills: new Set(["determine-platform", "bootstrap-clis"]) };

function check(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "demo",
    title: "Demo",
    area: "platform",
    scope: "project",
    probe: "platform-config",
    preflight: false,
    explain: "Why it matters.",
    handoff: "determine-platform",
    ...overrides,
  };
}

test("the shipped core registry satisfies the contract", () => {
  const core = loadCoreChecks(repoRoot);
  assert.deepEqual(core.errors, []);
  assert.ok(core.checks.length > 0);
});

test("the core registry runs the wiki-root check first", () => {
  const core = loadCoreChecks(repoRoot);
  assert.equal(core.checks[0]?.probe, "wiki-root");
});

test("a valid registry passes and keeps its order", () => {
  const result = validateRegistry({ contract: 1, checks: [check({ id: "a" }), check({ id: "b" })] }, context);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checks.map((item) => item.id), ["a", "b"]);
});

test("duplicate ids inside one registry are rejected", () => {
  const result = validateRegistry({ contract: 1, checks: [check(), check()] }, context);
  assert.deepEqual(result.checks, []);
  assert.match(result.errors.join("\n"), /duplicate id/);
});

test("a wrong contract version is rejected", () => {
  assert.match(validateRegistry({ contract: 2, checks: [] }, context).errors.join("\n"), /contract must be 1/);
});

test("each field is checked against the contract", () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ id: "Not Kebab" }, /id must be kebab-case/],
    [{ title: "" }, /title must be a non-empty string/],
    [{ explain: " " }, /explain must be a non-empty string/],
    [{ area: "elsewhere" }, /area must be one of/],
    [{ scope: "team" }, /scope must be global or project/],
    [{ probe: "tracker-api" }, /probe must be one of/],
    [{ handoff: "no-such-skill" }, /does not name a skill/],
    [{ handoff: undefined }, /exactly one of handoff or fix/],
    [{ fix: { kind: "location-strategy" } }, /exactly one of handoff or fix/],
    [{ handoff: undefined, fix: { kind: "config-key", key: "tracker", layer: "project" } }, /not a key nerdway-setup owns/],
    [{ handoff: undefined, fix: { kind: "env-hint", variable: "lower" } }, /environment variable name/],
    [{ handoff: undefined, fix: { kind: "run", command: "gh auth login" } }, /fix\.kind must be/],
    [{ preflight: "yes" }, /preflight must be true or false/],
    [{ extra: true }, /unknown key extra/],
  ];
  for (const [overrides, expected] of cases) {
    const entry = check(overrides);
    for (const key of Object.keys(entry)) if (entry[key] === undefined) delete entry[key];
    assert.match(checkErrors(entry, 0, context).join("\n"), expected, JSON.stringify(overrides));
  }
});

test("an owned key fix and the location fix are accepted", () => {
  for (const fix of [{ kind: "config-key", key: "wiki.path", layer: "defaults" }, { kind: "location-strategy" }]) {
    const entry = check({ fix });
    delete entry.handoff;
    assert.deepEqual(checkErrors(entry, 0, context), [], JSON.stringify(fix));
  }
});

test("a further check whose id collides with a core check is rejected and never overrides it", () => {
  const core = validateRegistry({ contract: 1, checks: [check({ id: "platform", title: "Core" })] }, context).checks;
  const merged = mergeChecks(core, [check({ id: "platform", title: "Impostor" }), check({ id: "added" })], context);
  assert.deepEqual(merged.checks.map((item: SetupCheck) => [item.id, item.title]), [
    ["platform", "Core"],
    ["added", "Demo"],
  ]);
  assert.equal(merged.rejected.length, 1);
  assert.equal(merged.rejected[0]?.id, "platform");
  assert.match(merged.rejected[0]?.reason ?? "", /never overrides/);
});

test("further checks that collide with each other or break the contract are rejected", () => {
  const merged = mergeChecks([], [check({ id: "one" }), check({ id: "one" }), check({ id: "two", probe: "nope" })], context);
  assert.deepEqual(merged.checks.map((item) => item.id), ["one"]);
  assert.deepEqual(merged.rejected.map((item) => item.id), ["one", "two"]);
});

test("every core id resolves to exactly one check", () => {
  const core = loadCoreChecks(repoRoot).checks;
  for (const item of core) {
    assert.equal(core.filter((other) => other.id === item.id).length, 1, item.id);
    assert.equal(checkById(core, item.id), item);
  }
  assert.equal(checkById(core, "no-such-check"), undefined);
});

test("every core fix targets an owned key and every other core check hands off to an existing skill", () => {
  const core = loadCoreChecks(repoRoot).checks;
  for (const item of core) {
    if (item.fix !== undefined) {
      if (item.fix.kind === "config-key") assert.equal(item.fix.key, "wiki.path", item.id);
    } else {
      assert.equal(typeof item.handoff, "string", item.id);
    }
  }
});
