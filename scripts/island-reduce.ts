import { stdin } from "node:process";

import {
  REVIEW_AXES,
  reduceMappedFindings,
  reducePlanContext,
  reduceVerdicts,
  type CandidateFinding,
  type PlanGathererOutput,
  type Vote,
} from "./lib/island-reducer.ts";

const MAX_RELATED_PAGES = 3;
const MAX_SEARCH_RESULTS = 5;
const VOTES = 3;
const REJECT_AT = 2;
const MAX_VERIFIED_FINDINGS = 12;

const USAGE = `usage:
  node scripts/island-reduce.ts plan < gatherers.json
  node scripts/island-reduce.ts review candidates < mapped.json
  node scripts/island-reduce.ts review verdicts < candidates-and-votes.json
flags: --max-related-pages <n> --max-prior-art <n> --votes <n> --reject-at <n> --max-verified-findings <n>
stdin holds exactly one JSON document per invocation`;

function usage() {
  console.error(USAGE);
  process.exit(2);
}

function fail(message: string) {
  console.log(JSON.stringify({ error: message }));
  process.exit(1);
}

function numberFlag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = Number(process.argv[at + 1]);
  if (!Number.isInteger(value) || value <= 0) usage();
  return value;
}

const [subcommand, stage] = process.argv.slice(2);
if (subcommand !== "plan" && subcommand !== "review") usage();
if (subcommand === "review" && stage !== "candidates" && stage !== "verdicts") usage();

const chunks: Buffer[] = [];
for await (const chunk of stdin) chunks.push(chunk as Buffer);
const text = Buffer.concat(chunks).toString("utf8");

let input: unknown;
try {
  input = JSON.parse(text);
} catch {
  fail("invalid JSON on stdin");
}

if (input === null || typeof input !== "object") fail("stdin must hold one JSON object or array");

if (subcommand === "plan") {
  const result = reducePlanContext(input as PlanGathererOutput, {
    maxRelatedPages: numberFlag("max-related-pages", MAX_RELATED_PAGES),
    maxPriorArt: numberFlag("max-prior-art", 2 * MAX_SEARCH_RESULTS),
  });
  console.log(JSON.stringify(result));
} else if (stage === "candidates") {
  if (!Array.isArray(input)) fail("review candidates expects a JSON array of mapper returns");
  const result = reduceMappedFindings(input, REVIEW_AXES, {
    votes: numberFlag("votes", VOTES),
    rejectAt: numberFlag("reject-at", REJECT_AT),
    maxVerifiedFindings: numberFlag("max-verified-findings", MAX_VERIFIED_FINDINGS),
  });
  console.log(JSON.stringify(result));
} else {
  const { candidates, votes, mappedCount, overflowCount } = input as {
    candidates?: unknown;
    votes?: unknown;
    mappedCount?: unknown;
    overflowCount?: unknown;
  };
  if (!Array.isArray(candidates) || !Array.isArray(votes)) {
    fail("review verdicts expects { candidates: [...], votes: [...], mappedCount: <n>, overflowCount: <n> }");
  }
  if (typeof mappedCount !== "number" || !Number.isInteger(mappedCount) || mappedCount < 0) {
    fail("review verdicts expects integer mappedCount >= 0 — take it from the review candidates output");
  }
  if (typeof overflowCount !== "number" || !Number.isInteger(overflowCount) || overflowCount < 0) {
    fail("review verdicts expects integer overflowCount >= 0 — take it from the review candidates output");
  }
  const result = reduceVerdicts(
    candidates as CandidateFinding[],
    votes as Array<Vote | null>,
    { mappedCount, overflowCount },
    {
      votes: numberFlag("votes", VOTES),
      rejectAt: numberFlag("reject-at", REJECT_AT),
      maxVerifiedFindings: numberFlag("max-verified-findings", MAX_VERIFIED_FINDINGS),
    },
  );
  console.log(JSON.stringify(result));
}
