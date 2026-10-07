import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const RUNNER = new URL("./island-reduce.ts", import.meta.url).pathname;

function run(args: string[], input: unknown) {
  const result = spawnSync(process.execPath, [RUNNER, ...args], { input: JSON.stringify(input), encoding: "utf8" });
  return { status: result.status, output: result.stdout.length > 0 ? JSON.parse(result.stdout) : null };
}

const spec = { axis: "spec-compliance", file: "h.ts", line: 3, claim: "add", evidence: "e", severity: "major", confidence: "high" };
const security = { ...spec, axis: "security", claim: "drop" };
const other = { ...spec, file: "i.ts", line: 9 };
const stats = { mapped: 3, verified: 3, rejected: 0, unverifiedOverflow: 0 };

test("review conflicts reads the verdicts output and lists the anchor collisions", () => {
  const { status, output } = run(["review", "conflicts"], { verified: [spec, other, security], stats, gaps: [] });

  assert.equal(status, 0);
  assert.deepEqual(output, { conflicts: [{ file: "h.ts", line: 3, findings: [spec, security] }] });
});

test("review judgments applies the verdicts and returns the final findings, conflicts and stats", () => {
  const { status, output } = run(["review", "judgments"], {
    verified: [spec, other, security],
    stats,
    judgments: [{ prevails: "security", reason: "the change leaks a token" }],
  });

  assert.equal(status, 0);
  assert.deepEqual(output.findings, [other, security]);
  assert.deepEqual(output.conflicts, [
    { file: "h.ts", line: 3, axes: ["spec-compliance", "security"], prevails: "security", reason: "the change leaks a token", overruled: [spec] },
  ]);
  assert.deepEqual(output.stats, { ...stats, verified: 2, overruled: 1 });
  assert.deepEqual(output.gaps, []);
});

test("review judgments with no conflicts still stamps overruled zero", () => {
  const { status, output } = run(["review", "judgments"], { verified: [other], stats: { ...stats, verified: 1 }, judgments: [] });

  assert.equal(status, 0);
  assert.deepEqual(output.stats, { ...stats, verified: 1, overruled: 0 });
  assert.deepEqual(output.conflicts, []);
});

test("review judgments rejects input without a judgments array", () => {
  const { status, output } = run(["review", "judgments"], { verified: [], stats });

  assert.equal(status, 1);
  assert.match(output.error, /judgments/);
});
