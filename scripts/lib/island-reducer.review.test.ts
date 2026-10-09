import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyJudgments,
  findAxisConflicts,
  reduceMappedFindings,
  reduceVerdicts,
  type CandidateFinding,
  type VerifiedFinding,
  type Vote,
} from "./island-reducer.ts";

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

test("reduceMappedFindings filters, sorts and caps", () => {
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
      file: "b.ts",
      line: 5,
      claim: "null check missing (standards view)",
      evidence: "same anchor",
      severity: "minor",
    },
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
    ["b.ts:5@critical", "a.ts:1@major", "b.ts:5@minor", "f.ts:2@minor"],
  );
  assert.deepEqual(overflow, []);
});

test("reduceMappedFindings dedups an anchor within one axis but keeps a collision across axes", () => {
  const { candidates } = reduceMappedFindings(
    [
      {
        findings: [
          { file: "g.ts", line: 4, claim: "weak", evidence: "e", severity: "minor" },
          { file: "g.ts", line: 4, claim: "strong", evidence: "e", severity: "major" },
        ],
      },
      { findings: [] },
      { findings: [{ file: "g.ts", line: 4, claim: "opposite", evidence: "e", severity: "minor" }] },
      { findings: [] },
    ],
    [...AXES],
    REVIEW_LIMITS,
  );

  assert.deepEqual(
    candidates.map((f) => `${f.axis}|${f.claim}`),
    ["spec-compliance|strong", "correctness-regressions|opposite"],
  );
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

  const result = reduceVerdicts(candidates, votes, { mappedCount: 9, overflowCount: 0 }, REVIEW_LIMITS);

  assert.deepEqual(
    result.verified.map((f) => [f.file, f.line, f.confidence]),
    [
      ["x.ts", 1, "medium"],
      ["x.ts", 4, "high"],
    ],
  );
  assert.deepEqual(result.stats, { mapped: 9, verified: 2, rejected: 1, unverifiedOverflow: 1 });
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
    { mappedCount: 5, overflowCount: 2 },
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified.map((f) => f.file), ["y.ts"]);
  assert.deepEqual(result.stats, { mapped: 5, verified: 1, rejected: 0, unverifiedOverflow: 3 });
  assert.deepEqual(result.gaps, [
    "finding y.ts:1 got 1 of 3 votes — dropped unverified, never passed by default",
  ]);
});

test("reduceVerdicts caps confidence at medium and records a gap when a finding passes on 2 of 3 votes", () => {
  const candidates = [
    { axis: "security", file: "p.ts", line: 4, claim: "c1", evidence: "e1", severity: "major" },
  ] satisfies CandidateFinding[];

  const result = reduceVerdicts(
    candidates,
    [{ refuted: false, justification: "stands" }, null, { refuted: false, justification: "stands" }],
    { mappedCount: 1, overflowCount: 0 },
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified.map((f) => [f.file, f.line, f.confidence]), [["p.ts", 4, "medium"]]);
  assert.deepEqual(result.stats, { mapped: 1, verified: 1, rejected: 0, unverifiedOverflow: 0 });
  assert.deepEqual(result.gaps, ["finding p.ts:4 verified on 2 of 3 votes — confidence capped at medium"]);
});

test("reduceVerdicts records a gap when a finding passes on 2 of 3 votes with one refutation", () => {
  const candidates = [
    { axis: "correctness-regressions", file: "q.ts", line: 8, claim: "c1", evidence: "e1", severity: "minor" },
  ] satisfies CandidateFinding[];

  const result = reduceVerdicts(
    candidates,
    [null, { refuted: true, justification: "doubt" }, { refuted: false, justification: "stands" }],
    { mappedCount: 1, overflowCount: 0 },
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified.map((f) => [f.file, f.line, f.confidence]), [["q.ts", 8, "medium"]]);
  assert.deepEqual(result.stats, { mapped: 1, verified: 1, rejected: 0, unverifiedOverflow: 0 });
  assert.deepEqual(result.gaps, ["finding q.ts:8 verified on 2 of 3 votes — confidence capped at medium"]);
});

test("reduceVerdicts records a gap when a finding is rejected on 2 of 3 votes", () => {
  const candidates = [
    { axis: "repo-standards", file: "r.ts", line: 15, claim: "c1", evidence: "e1", severity: "minor" },
  ] satisfies CandidateFinding[];

  const result = reduceVerdicts(
    candidates,
    [{ refuted: true, justification: "gone" }, { refuted: true, justification: "gone" }, null],
    { mappedCount: 1, overflowCount: 0 },
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified, []);
  assert.deepEqual(result.stats, { mapped: 1, verified: 0, rejected: 1, unverifiedOverflow: 0 });
  assert.deepEqual(result.gaps, ["finding r.ts:15 rejected on 2 of 3 votes"]);
});

test("reduceVerdicts tolerates empty votes and malformed vote objects", () => {
  const candidates = [
    { axis: "security", file: "z.ts", line: 1, claim: "c1", evidence: "e1", severity: "minor" },
  ] satisfies CandidateFinding[];

  const result = reduceVerdicts(
    candidates,
    [{ refuted: "yes", justification: 42 } as unknown as Vote, null, null],
    { mappedCount: 4, overflowCount: 0 },
    REVIEW_LIMITS,
  );

  assert.deepEqual(result.verified, []);
  assert.deepEqual(result.stats, { mapped: 4, verified: 0, rejected: 0, unverifiedOverflow: 1 });
  assert.deepEqual(result.gaps, [
    "finding z.ts:1 got 0 of 3 votes — dropped unverified, never passed by default",
  ]);
});

function verifiedAt(axis: (typeof AXES)[number], file: string, line: number, claim: string): VerifiedFinding {
  return { axis, file, line, claim, evidence: "e", severity: "major", confidence: "high" };
}

test("findAxisConflicts groups verified findings from different axes on one anchor", () => {
  const verified = [
    verifiedAt("spec-compliance", "h.ts", 3, "add the flag"),
    verifiedAt("security", "i.ts", 1, "unrelated"),
    verifiedAt("security", "h.ts", 3, "drop the flag"),
    verifiedAt("repo-standards", "h.ts", 3, "rename the flag"),
  ];

  assert.deepEqual(findAxisConflicts(verified), [
    { file: "h.ts", line: 3, findings: [verified[0], verified[2], verified[3]] },
  ]);
});

test("findAxisConflicts returns nothing when no anchor is shared", () => {
  const verified = [
    verifiedAt("spec-compliance", "h.ts", 3, "a"),
    verifiedAt("security", "h.ts", 4, "b"),
  ];

  assert.deepEqual(findAxisConflicts(verified), []);
});

test("findAxisConflicts ignores two findings of one axis on one anchor", () => {
  const verified = [
    verifiedAt("security", "h.ts", 3, "a"),
    verifiedAt("security", "h.ts", 3, "b"),
  ];

  assert.deepEqual(findAxisConflicts(verified), []);
});

const VERDICT_STATS = { mapped: 7, verified: 4, rejected: 1, unverifiedOverflow: 0 };

function collidingVerified() {
  return [
    verifiedAt("spec-compliance", "h.ts", 3, "add the flag"),
    verifiedAt("security", "i.ts", 1, "unrelated"),
    verifiedAt("security", "h.ts", 3, "drop the flag"),
    verifiedAt("correctness-regressions", "j.ts", 8, "off by one"),
  ];
}

test("applyJudgments without conflicts passes the findings through and counts zero overruled", () => {
  const verified = [verifiedAt("security", "i.ts", 1, "unrelated")];

  const result = applyJudgments(verified, [], { ...VERDICT_STATS, verified: 1 });

  assert.deepEqual(result, {
    findings: verified,
    conflicts: [],
    stats: { mapped: 7, verified: 1, rejected: 1, unverifiedOverflow: 0, overruled: 0 },
    gaps: [],
  });
});

test("applyJudgments drops the overruled finding and records it verbatim in conflicts", () => {
  const verified = collidingVerified();

  const result = applyJudgments(verified, [{ prevails: "security", reason: "the flag leaks a token" }], VERDICT_STATS);

  assert.deepEqual(result.findings, [verified[1], verified[2], verified[3]]);
  assert.deepEqual(result.conflicts, [
    {
      file: "h.ts",
      line: 3,
      axes: ["spec-compliance", "security"],
      prevails: "security",
      reason: "the flag leaks a token",
      overruled: [verified[0]],
    },
  ]);
  assert.deepEqual(result.stats, { mapped: 7, verified: 3, rejected: 1, unverifiedOverflow: 0, overruled: 1 });
  assert.deepEqual(result.gaps, []);
});

test("applyJudgments with verdict both keeps every finding of the conflict", () => {
  const verified = collidingVerified();

  const result = applyJudgments(verified, [{ prevails: "both", reason: "they agree" }], VERDICT_STATS);

  assert.deepEqual(result.findings, verified);
  assert.deepEqual(result.conflicts, [
    {
      file: "h.ts",
      line: 3,
      axes: ["spec-compliance", "security"],
      prevails: "both",
      reason: "they agree",
      overruled: [],
    },
  ]);
  assert.equal(result.stats.overruled, 0);
  assert.equal(result.stats.verified, 4);
});

test("applyJudgments never resolves a conflict silently when the verdict is missing or invalid", () => {
  for (const judgment of [
    null,
    { prevails: "repo-standards", reason: "axis not in the conflict" },
    { prevails: "security" },
  ]) {
    const verified = collidingVerified();

    const result = applyJudgments(verified, [judgment], VERDICT_STATS);

    assert.deepEqual(result.findings, verified);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.stats.overruled, 0);
    assert.deepEqual(result.gaps, [
      "conflict at h.ts:3 got no valid judge verdict — all 2 findings kept, nothing resolved silently",
    ]);
  }
});

test("applyJudgments keeps every finding when the verdict would overrule a security finding", () => {
  const verified = collidingVerified();

  const result = applyJudgments(verified, [{ prevails: "spec-compliance", reason: "the flag was asked for" }], VERDICT_STATS);

  assert.deepEqual(result.findings, verified);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.stats, { mapped: 7, verified: 4, rejected: 1, unverifiedOverflow: 0, overruled: 0 });
  assert.deepEqual(result.gaps, [
    "conflict at h.ts:3: verdict spec-compliance would overrule a security finding — all 2 findings kept",
  ]);
});

test("applyJudgments keeps every finding of a three-axis conflict when the verdict would overrule security", () => {
  const verified = [
    verifiedAt("spec-compliance", "h.ts", 3, "add the flag"),
    verifiedAt("security", "h.ts", 3, "drop the flag"),
    verifiedAt("repo-standards", "h.ts", 3, "rename the flag"),
  ];

  const result = applyJudgments(verified, [{ prevails: "repo-standards", reason: "naming wins" }], VERDICT_STATS);

  assert.deepEqual(result.findings, verified);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.stats.overruled, 0);
  assert.deepEqual(result.gaps, [
    "conflict at h.ts:3: verdict repo-standards would overrule a security finding — all 3 findings kept",
  ]);
});

test("applyJudgments still overrules a finding in a conflict without the security axis", () => {
  const verified = [
    verifiedAt("spec-compliance", "h.ts", 3, "add the flag"),
    verifiedAt("repo-standards", "h.ts", 3, "rename the flag"),
  ];

  const result = applyJudgments(verified, [{ prevails: "spec-compliance", reason: "the flag was asked for" }], VERDICT_STATS);

  assert.deepEqual(result.findings, [verified[0]]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.stats.overruled, 1);
  assert.deepEqual(result.gaps, []);
});

test("severity helpers only accept the four axes and three severities", () => {
  assert.deepEqual([...SEVERITIES], ["critical", "major", "minor"]);
  assert.deepEqual([...AXES].length, 4);
});
