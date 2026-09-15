import { test } from "node:test";
import assert from "node:assert/strict";

import { reducePlanContext } from "./island-reducer.ts";

test("plan happy path reduces five gatherers into typed context with zero gaps", () => {
  const result = reducePlanContext(
    {
      repoFacts: {
        repoLayout: "scripts/ holds the tooling, workflows/ the islands",
        commands: ["node --test 'scripts/**/*.test.ts'"],
      },
      conventions: { items: ["ADR-0003: contract first", "CONTEXT.md: no code comments", "commits: Polish noun form"] },
      priorPlans: { items: ["docs/superpowers/plans/demo-311.md — dual manifests"] },
      trackerRelations: { items: ["DEMO-311 (Done): Cursor packaging — the base this builds on"] },
      vault: {
        slug: "nerd4rent-claude-plugin",
        decisions: ["2026-09-14 — Cursor reducer lives in scripts/lib/island-reducer.ts"],
        activeContext: "DEMO-331 in flight",
        relatedPages: ["pwlazlo", "nerdbrain"],
      },
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.deepEqual(result.gaps, []);
  assert.equal(result.planContext.repoLayout, "scripts/ holds the tooling, workflows/ the islands");
  assert.deepEqual(result.planContext.commands, ["node --test 'scripts/**/*.test.ts'"]);
  assert.deepEqual(result.planContext.conventions, [
    "ADR-0003: contract first",
    "CONTEXT.md: no code comments",
    "commits: Polish noun form",
  ]);
  assert.deepEqual(result.planContext.priorArt, [
    "docs/superpowers/plans/demo-311.md — dual manifests",
    "DEMO-311 (Done): Cursor packaging — the base this builds on",
  ]);
  assert.deepEqual(result.planContext.stats, {
    gatherers: [
      { source: "repo-layout", returned: 1, unique: 1 },
      { source: "conventions", returned: 3, unique: 3 },
      { source: "prior-plans", returned: 1, unique: 1 },
      { source: "tracker-relations", returned: 1, unique: 1 },
      { source: "vault", returned: 3, unique: 3 },
    ],
    duplicatesDropped: 0,
    gapsCount: 0,
  });
  assert.deepEqual(result.projectContext, {
    slug: "nerd4rent-claude-plugin",
    decisions: ["2026-09-14 — Cursor reducer lives in scripts/lib/island-reducer.ts"],
    activeContext: "DEMO-331 in flight",
    relatedPages: ["pwlazlo", "nerdbrain"],
  });
});

test("duplicates are dropped and attributed to the first contributing gatherer", () => {
  const result = reducePlanContext(
    {
      repoFacts: { repoLayout: "layout", commands: [] },
      conventions: { items: ["shared rule", "ADR rule"] },
      priorPlans: { items: ["plans entry", "shared prior"] },
      trackerRelations: { items: ["shared prior", "tracker entry"] },
      vault: {
        slug: "slug",
        decisions: ["decision"],
        activeContext: "active",
        relatedPages: [],
      },
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.deepEqual(result.planContext.priorArt, ["plans entry", "shared prior", "tracker entry"]);
  assert.deepEqual(
    result.planContext.stats.gatherers.map((row) => ({ source: row.source, returned: row.returned, unique: row.unique })),
    [
      { source: "repo-layout", returned: 0, unique: 0 },
      { source: "conventions", returned: 2, unique: 2 },
      { source: "prior-plans", returned: 2, unique: 2 },
      { source: "tracker-relations", returned: 2, unique: 1 },
      { source: "vault", returned: 1, unique: 1 },
    ],
  );
  assert.equal(result.planContext.stats.duplicatesDropped, 1);
  assert.deepEqual(result.gaps, []);
});

test("blank and non-string items are dropped before the returned count", () => {
  const result = reducePlanContext(
    {
      repoFacts: { repoLayout: "layout", commands: [] },
      conventions: { items: ["", "   ", "real", 42 as unknown as string] },
      priorPlans: { items: [] },
      trackerRelations: { items: [] },
      vault: null,
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.deepEqual(result.planContext.conventions, ["real"]);
  const conventions = result.planContext.stats.gatherers.find((row) => row.source === "conventions");
  assert.equal(conventions?.returned, 1);
  assert.equal(conventions?.unique, 1);
});

test("prior art is capped at maxPriorArt across both sources", () => {
  const result = reducePlanContext(
    {
      repoFacts: { repoLayout: "layout", commands: [] },
      conventions: { items: [] },
      priorPlans: { items: ["p1", "p2", "p3"] },
      trackerRelations: { items: ["t1", "t2"] },
      vault: null,
    },
    { maxRelatedPages: 3, maxPriorArt: 4 },
  );

  assert.deepEqual(result.planContext.priorArt, ["p1", "p2", "p3", "t1"]);
  const tracker = result.planContext.stats.gatherers.find((row) => row.source === "tracker-relations");
  assert.equal(tracker?.returned, 2);
  assert.equal(tracker?.unique, 1);
  assert.equal(result.planContext.stats.duplicatesDropped, 1);
});

test("related pages are capped at maxRelatedPages", () => {
  const result = reducePlanContext(
    {
      repoFacts: { repoLayout: "layout", commands: [] },
      conventions: { items: [] },
      priorPlans: { items: [] },
      trackerRelations: { items: [] },
      vault: {
        slug: "slug",
        decisions: ["one decision"],
        activeContext: "active",
        relatedPages: ["r1", "r2", "r3", "r4", "r5"],
      },
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.deepEqual(result.projectContext?.relatedPages, ["r1", "r2", "r3"]);
  const vault = result.planContext.stats.gatherers.find((row) => row.source === "vault");
  assert.equal(vault?.returned, 6);
  assert.equal(vault?.unique, 4);
  assert.equal(result.planContext.stats.duplicatesDropped, 2);
});

test("a failed repo gatherer keeps its zero row and flags every gap", () => {
  const result = reducePlanContext(
    {
      repoFacts: null,
      conventions: { items: ["c"] },
      priorPlans: { items: [] },
      trackerRelations: { items: [] },
      vault: null,
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.equal(result.planContext.repoLayout, "");
  assert.deepEqual(result.planContext.conventions, ["c"]);
  assert.deepEqual(result.projectContext, null);
  assert.deepEqual(result.gaps, [
    "repo-layout gatherer failed: repoLayout and commands are missing",
    "PlanContext.repoLayout is empty — degrade to the sequential context read for that part",
    "vault gatherer failed (vault unreachable or no entity page): ProjectContext is absent",
  ]);
  assert.equal(result.planContext.stats.gapsCount, 3);
  const repoRow = result.planContext.stats.gatherers.find((row) => row.source === "repo-layout");
  assert.deepEqual(repoRow, { source: "repo-layout", returned: 0, unique: 0 });
});

test("incomplete project context becomes null with a partial-context gap", () => {
  const result = reducePlanContext(
    {
      repoFacts: { repoLayout: "layout", commands: ["cmd"] },
      conventions: { items: ["c"] },
      priorPlans: { items: [] },
      trackerRelations: { items: [] },
      vault: { slug: "slug", decisions: [], activeContext: "", relatedPages: [] },
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.equal(result.projectContext, null);
  assert.deepEqual(result.gaps, ["ProjectContext incomplete (decisions empty) — treat vault context as partial"]);
});

test("a failed tracker-relations gatherer contributes only its own gap", () => {
  const result = reducePlanContext(
    {
      repoFacts: { repoLayout: "layout", commands: ["cmd"] },
      conventions: { items: ["c"] },
      priorPlans: { items: ["p"] },
      trackerRelations: null,
      vault: { slug: "slug", decisions: ["d"], activeContext: "active", relatedPages: [] },
    },
    { maxRelatedPages: 3, maxPriorArt: 10 },
  );

  assert.deepEqual(result.gaps, ["tracker-relations gatherer failed: related issues are missing"]);
  assert.ok(result.projectContext !== null);
});
