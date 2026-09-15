import { test } from "node:test";
import assert from "node:assert/strict";

import { reduceMappedFindings, reduceVerdicts, type CandidateFinding, type Vote } from "./island-reducer.ts";

const AXES = ["spec-compliance", "repo-standards", "correctness-regressions", "security"] as const;
const SEVERITIES = ["critical", "major", "minor"] as const;

const REVIEW_LIMITS = { votes: 3, rejectAt: 2, maxVerifiedFindings: 12 };

function mappedFixture() {
  return [
    {
      findings: [
        { file: "a.ts", line: 1, claim: "spec drift", evidence: "AC2 unmet", severity: "major" },
        { file: "b.ts", line: 5, claim: "missing null check", evidence: "null input crashes", severity: "critical" },
        { file: "c.ts", line: 9, claim: "not a rule", evidence: "", severity: "minor" },
        { file: "d.ts", line: "3" as unknown as number, claim: "bad line", evidence: "evidence", severity: "minor" },
        { file: "", line: 2, claim: "empty file", evidence: "evidence", severity: "minor" },
        { file: "e.ts", line: 7, claim: "wrong severity", evidence: "evidence", severity: "blocker" },
      ],
    },
    {
      findings: [
        { file: "b.ts", line: 5, claim: "null check missing (standards view)", evidence: "same anchor", severity: "minor" },
        { file: "f.ts", line: 2, claim: "fmt deviation", evidence: "standard 3", severity: "minor" },
        null,
      ],
    },
    null,
    { findings: "not-an-array" },
  ] as Array<unknown>;
}

test("reduceMappedFindings filters, dedups by anchor keeping the most severe, sorts and caps", () => {
  const { candidates, overflow, mappedCount, gaps } = reduceMappedFindings(
    mappedFixture(),
    [...AXES],
    { ...REVIEW_LIMITS, maxVerifiedFindings: 2 },
  );

  assert.equal(mappedCount, 9);
  assert.deepEqual(gaps, [
    "correctness-regressions mapper failed: the axis is missing from this run",
  ]);
  assert.deepEqual(candidates, [
    {
      axis: "spec-compliance",
      file: "b.ts",
      line: 5,
      claim: "missing null check",
      evidence: "null input crashes",
      severity: "critical",
    },
    {
      axis: "spec-compliance",
      file: "a.ts",
      line: 1,
      claim: "spec drift",
      evidence: "AC2 unmet",
      severity: "major",
    },
  ]);
  assert.deepEqual(overflow, [
    {
      axis: "repo-standards",
      file: "f.ts",
      line: 2,
      claim: "fmt deviation",
      evidence: "standard 3",
      severity: "minor",
    },
  ]);
});

test("reduceMappedFindings with a wide cap keeps every well-formed finding sorted by severity then arrival", () => {
  const { candidates, overflow, mappedCount, gaps } = reduceMappedFindings(
    mappedFixture(),
    [...AXES],
    REVIEW_LIMITS,
  );

  assert.equal(mappedCount, 9);
  assert.deepEqual(gaps, ["correctness-regressions mapper failed: the axis is missing from this run"]);
  assert.deepEqual(
    candidates.map((f) => `${f.file}:${f.line}@${f.severity}`),
    ["b.ts:5@critical", "a.ts:1@major", "f.ts:2@minor"],
  );
  assert.deepEqual(overflow, []);
});

test("reduceVerdicts rejects at 2 of 3, stamps confidence, and counts unverified", () => {
  const candidates = [
    { axis: "security", file: "x.ts", line: 1, claim: "c1", evidence: "e1", severity: "critical" },
    { axis: "security", file: "x.ts", line: 2, claim: "c2", evidence: "e2", severity: "major" },
    { axis: "security", file: "x.ts", line: 3, claim: "c3", evidence: "e3", severity: "minor" },
    { axis: "security", file: "x.ts", line: 4, claim: "c4", evidence: "e4", severity: "minor" },
  ] satisfies CandidateFinding[];

  const votes: Array<Vote | null> = [
    { refuted: false, justification: "stands" },
    { refuted: false, justification: "stands" },
    { refuted: true, justification: "doubt" },
    { refuted: true, justification: "gone" },
    { refuted: true, justification: "duplicate of line 1" },
    { refuted: false, justification: "stands" },
    null,
    { refuted: false, justification: "stands" },
    null,
    { refuted: false, justification: "stands" },
    { refuted: false, justification: "stands" },
    { refuted: false, justification: "stands" },
  ];

  const result = reduceVerdicts(candidates, votes, REVIEW_LIMITS);

  assert.deepEqual(
    result.verified.map((f) => [f.file, f.line, f.confidence]),
    [
      ["x.ts", 1, "medium"],
      ["x.ts", 4, "high"],
    ],
  );
  assert.deepEqual(result.stats, { mapped: 4, verified: 2, rejected: 1, unverifiedOverflow: 1 });
  assert.deepEqual(result.gaps, [
    "finding x.ts:3 got 1 of 3 votes — dropped unverified, never passed by default",
  ]);
});

test("reduceVerdicts treats fewer than rejectAt cast votes as unverified with a gap", () => {
  const candidates = [
    { axis: "security", file: "y.ts", line: 1, claim: "c1", evidence: "e1", severity: "major" },
    { axis: "security", file: "y.ts", line: 2, claim: "c2", evidence: "e2", severity: "minor" },
  ] satisfies CandidateFinding[];

  const result = reduceVerdicts(
    candidates,
    [
      { refuted: false, justification: "stands" },
      null,
      null,
      { refuted: false, justification: "stands" },
      { refuted: false, justification: "stands" },
      { refuted: false, justification: "stands" },
    ],
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified.map((f) => f.file), ["y.ts"]);
  assert.deepEqual(result.stats, { mapped: 2, verified: 1, rejected: 0, unverifiedOverflow: 1 });
  assert.deepEqual(result.gaps, [
    "finding y.ts:1 got 1 of 3 votes — dropped unverified, never passed by default",
  ]);
});

test("reduceVerdicts tolerates empty votes and malformed vote objects", () => {
  const candidates = [
    { axis: "security", file: "z.ts", line: 1, claim: "c1", evidence: "e1", severity: "minor" },
  ] satisfies CandidateFinding[];

  const result = reduceVerdicts(
    candidates,
    [{ refuted: "yes", justification: 42 } as unknown as Vote, null, null],
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified, []);
  assert.deepEqual(result.stats, { mapped: 1, verified: 0, rejected: 0, unverifiedOverflow: 1 });
  assert.deepEqual(result.gaps, [
    "finding z.ts:1 got 0 of 3 votes — dropped unverified, never passed by default",
  ]);
});

test("severity helpers only accept the four axes and three severities", () => {
  assert.deepEqual([...SEVERITIES], ["critical", "major", "minor"]);
  assert.deepEqual([...AXES].length, 4);
});
