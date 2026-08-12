export const meta = {
  name: 'review-verify',
  description: 'Review a change range along 4 independent axes, reduce deterministically, verify adversarially, synthesize a summary',
  whenToUse: 'Review phase of linear-issue-workflow, after review-menu confirmed the axes and engines',
  phases: [
    { title: 'Map', detail: 'one mapper per review axis, all four concurrent' },
    { title: 'Verify', detail: '3 sceptics per finding, batches of at most 8' },
    { title: 'Synthesize', detail: 'one agent writes the summary from the verified set' },
  ],
}

// The island behind the `review-verify` contract node: map → reduce → verify → synthesize.
// Input arrives as args: { issueId: "TEAM-123", request: <ReviewRequest> } — the ReviewRequest
// edge payload plus the issue id the spec-compliance mapper queries by (same convention as
// plan-context-fanout).

// Verbatim copy of the registry body in workflow-graph.json — the script cannot read the
// contract at runtime, so the drift check (validator rules 17-18) holds this literal
// deep-equal to the registry. It is also the island's live exit check: the reducer keeps
// only findings satisfying its $defs required list, and the result is checked against its
// top-level required list before returning.
const SCHEMA_ReviewFindings = {
  "type": "object",
  "title": "Review findings",
  "properties": {
    "summary": {
      "type": "string",
      "title": "Summary",
      "description": "One paragraph: what the review covered and whether the change is ready."
    },
    "findings": {
      "type": "array",
      "title": "Findings",
      "description": "One row per finding that survived verification.",
      "items": { "$ref": "#/$defs/ReviewFinding" }
    },
    "stats": {
      "type": "object",
      "title": "Stats",
      "description": "Degradation made visible: what each stage let through, so a silent drop is impossible.",
      "properties": {
        "mapped": {
          "type": "integer",
          "title": "Mapped",
          "description": "Raw findings the axis mappers returned, before reduction."
        },
        "verified": {
          "type": "integer",
          "title": "Verified",
          "description": "Findings that survived adversarial verification."
        },
        "rejected": {
          "type": "integer",
          "title": "Rejected",
          "description": "Findings refuted by 2 or more of the 3 sceptics."
        },
        "unverifiedOverflow": {
          "type": "integer",
          "title": "Unverified overflow",
          "description": "Findings that never got a verdict: past the verification cap, or with fewer than 2 votes cast."
        }
      },
      "required": ["mapped", "verified", "rejected", "unverifiedOverflow"]
    }
  },
  "required": ["summary", "findings", "stats"],
  "$defs": {
    "ReviewFinding": {
      "type": "object",
      "title": "Finding",
      "description": "A single verified finding.",
      "properties": {
        "axis": {
          "type": "string",
          "title": "Axis",
          "description": "The review axis that raised the finding.",
          "enum": ["spec-compliance", "repo-standards", "correctness-regressions", "security"]
        },
        "file": {
          "type": "string",
          "title": "File",
          "description": "Repo-relative path the finding sits in."
        },
        "line": {
          "type": "integer",
          "title": "Line",
          "description": "1-indexed line the finding anchors to."
        },
        "claim": {
          "type": "string",
          "title": "Claim",
          "description": "One sentence stating the defect."
        },
        "evidence": {
          "type": "string",
          "title": "Evidence",
          "description": "Concrete inputs or state that make the claim fail — what makes it checkable."
        },
        "severity": {
          "type": "string",
          "title": "Severity",
          "description": "How much damage it does if left in.",
          "enum": ["critical", "major", "minor"]
        },
        "confidence": {
          "type": "string",
          "title": "Confidence",
          "description": "How sure the verification pass is that the finding is real.",
          "enum": ["high", "medium", "low"]
        }
      },
      "required": ["axis", "file", "line", "claim", "evidence", "severity", "confidence"]
    }
  }
}

// The rejection rule and width budget, mirrored from the contract (the script cannot read
// it at runtime): 3 sceptics per finding, 2 or more refutations reject it; at most 12
// findings enter verification; at most 8 agents run concurrently (review-verify
// budget.maxWidth = 8) — honoured constructively by batching, not by a runtime limit.
const VOTES = 3
const REJECT_AT = 2
const MAX_VERIFIED_FINDINGS = 12
const BATCH = 8

const AXES = ['spec-compliance', 'repo-standards', 'correctness-regressions', 'security']
const SEVERITY_RANK = { critical: 0, major: 1, minor: 2 }

// The Workflow harness has been observed delivering `args` as a JSON-encoded string even
// when the caller passed a real object (live run wf_7dbcb074, Claude Code 2.1.226).
let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch {
    input = {}
  }
}
const issueId = input && input.issueId ? String(input.issueId) : ''
const request = input && input.request ? input.request : {}
const range = typeof request.range === 'string' && request.range.length > 0 ? request.range : 'main...HEAD'
const requestedAxes = Array.isArray(request.axes) ? request.axes : []

const gaps = []
if (issueId === '') {
  gaps.push('spec-compliance axis ran without an issue id — acceptance criteria not read from Linear')
}

// The engine is a prompt hint, never a hard invocation: the subagent may lack the skill,
// and the axis must still produce findings.
const ENGINE_HINTS = {
  'superpowers': 'If the superpowers code-review skills are available in your session, follow their review methodology; otherwise review directly.',
  'matt-pocock': 'If mattpocock-skills:code-review is available in your session, follow its review methodology; otherwise review directly.',
  'code-review': 'Follow the /code-review methodology: verified, high-confidence findings only.',
  'plain-agent': 'Review directly, no framework skill.',
}

function engineFor(axisId) {
  const declared = requestedAxes.find((axis) => axis && axis.id === axisId)
  return declared && typeof declared.engine === 'string' && Object.hasOwn(ENGINE_HINTS, declared.engine)
    ? declared.engine
    : 'plain-agent'
}

const AXIS_PROMPTS = {
  'spec-compliance':
    `Review ONLY for spec compliance: does the change do what the issue asked, no more and no less? ` +
    (issueId === ''
      ? `No issue id was provided, so acceptance criteria are not readable from Linear: read the pull request description (\`gh pr view\`) and review the change against the intent stated there. `
      : `Read the issue's acceptance criteria first: run \`linear issues get ${issueId} -o json\` (read-only) and use its description. `) +
    `Report each unmet or violated acceptance criterion as a finding anchored to the diff line that misses it.`,
  'repo-standards':
    'Review ONLY against the repo coding standards: read the "## Standards" section of CONTEXT.md and check the diff against those rules alone. ' +
    'Report each rule violation as a finding citing the violated rule in the claim.',
  'correctness-regressions':
    'Review ONLY for correctness bugs and regressions: logic errors, broken edge cases, behaviour the change silently alters. ' +
    'Report only defects the diff introduces, each with concrete failing inputs or state as evidence.',
  'security':
    'Review ONLY for security: injection, secrets in the diff, unsafe file or process access, trust-boundary violations. ' +
    'Report only issues the diff introduces or worsens.',
}

// Intermediate shapes — deliberately NOT named SCHEMA_<Name>: they are not contract edges,
// so they must stay invisible to the drift check. The finding item is the flattened
// ReviewFinding minus axis (the reducer stamps the axis deterministically) and minus
// confidence (only the verification pass can say how sure it is).
const findingListShape = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'Repo-relative path the finding sits in' },
          line: { type: 'integer', description: '1-indexed line the finding anchors to' },
          claim: { type: 'string', description: 'One sentence stating the defect' },
          evidence: { type: 'string', description: 'Concrete inputs or state that make the claim fail' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        },
        required: ['file', 'line', 'claim', 'evidence', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const voteShape = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean', description: 'true when the finding does not hold up' },
    justification: { type: 'string', description: 'Why the finding stands or falls — one or two sentences' },
  },
  required: ['refuted', 'justification'],
}

const summaryShape = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One paragraph: what the review covered and whether the change is ready' },
  },
  required: ['summary'],
}

const diffInstruction =
  `Change range under review: \`${range}\`. Read the diff yourself: \`git diff ${range}\` ` +
  `(or \`gh pr diff\` when the range points at a pull request). Anchor every finding to a file and line in that diff.`

phase('Map')
log(`Mapping 4 review axes over ${range}`)

const mapped = await parallel(
  AXES.map((axisId) => () =>
    agent(
      `You are one review axis of a four-axis code review. ${AXIS_PROMPTS[axisId]}\n\n` +
        `${diffInstruction}\n\n` +
        `Engine: ${ENGINE_HINTS[engineFor(axisId)]}\n\n` +
        `Stay strictly on your axis — the other three are covered by other reviewers. ` +
        `Return an empty findings list rather than padding with weak findings.`,
      { label: `map:${axisId}`, phase: 'Map', schema: findingListShape },
    ),
  ),
)

// --- Deterministic reducer: plain code, no agents, no clock, no randomness. ---

const FINDING_REQUIRED = SCHEMA_ReviewFindings.$defs.ReviewFinding.required
const SEVERITIES = SCHEMA_ReviewFindings.$defs.ReviewFinding.properties.severity.enum

function isWellFormed(finding) {
  if (typeof finding !== 'object' || finding === null) return false
  if (typeof finding.file !== 'string' || finding.file.trim().length === 0) return false
  if (!Number.isInteger(finding.line)) return false
  if (typeof finding.claim !== 'string' || finding.claim.trim().length === 0) return false
  if (typeof finding.evidence !== 'string' || finding.evidence.trim().length === 0) return false
  return SEVERITIES.includes(finding.severity)
}

let mappedCount = 0
const deduped = []
const anchorIndex = new Map()
for (let i = 0; i < AXES.length; i++) {
  if (mapped[i] === null) {
    gaps.push(`${AXES[i]} mapper failed: the axis is missing from this run`)
    continue
  }
  const findings = Array.isArray(mapped[i].findings) ? mapped[i].findings : []
  mappedCount += findings.length
  for (const finding of findings) {
    if (!isWellFormed(finding)) continue
    const anchor = `${finding.file.trim()}:${finding.line}`
    const entry = {
      axis: AXES[i],
      file: finding.file.trim(),
      line: finding.line,
      claim: finding.claim.trim(),
      evidence: finding.evidence.trim(),
      severity: finding.severity,
    }
    const at = anchorIndex.get(anchor)
    if (at === undefined) {
      anchorIndex.set(anchor, deduped.length)
      deduped.push(entry)
    } else if (SEVERITY_RANK[entry.severity] < SEVERITY_RANK[deduped[at].severity]) {
      deduped[at] = entry
    }
  }
}

const candidates = deduped
  .map((finding, index) => ({ finding, index }))
  .sort((a, b) => SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.index - b.index)
  .map((entry) => entry.finding)

const overflow = candidates.splice(MAX_VERIFIED_FINDINGS)
let unverifiedOverflow = overflow.length

log(`Reduced: ${mappedCount} mapped → ${deduped.length} well-formed and deduped, ${candidates.length} to verify, ${overflow.length} over the cap`)

phase('Verify')

// One (finding, vote) pair per sceptic, batched so at most BATCH agents run at once —
// the contract's maxWidth honoured by construction.
const pairs = candidates.flatMap((finding, findingIndex) =>
  Array.from({ length: VOTES }, (_, voteIndex) => ({ finding, findingIndex, voteIndex })),
)
const votes = []
for (let start = 0; start < pairs.length; start += BATCH) {
  const batch = pairs.slice(start, start + BATCH)
  const results = await parallel(
    batch.map((pair) => () =>
      agent(
        `You are sceptic ${pair.voteIndex + 1} of ${VOTES}, verifying one code-review finding. ` +
          `Your goal is the OPPOSITE of the reviewer's: try to REFUTE the finding. It stands only if it survives your attack.\n\n` +
          `${diffInstruction}\n\n` +
          `The finding, from the ${pair.finding.axis} axis:\n${JSON.stringify(pair.finding, null, 2)}\n\n` +
          `Check the claim against the actual diff and repo. Refute it if the defect is not real, ` +
          `not introduced by this change, not at the stated location, or the evidence does not hold. ` +
          `When genuinely uncertain, refute.`,
        { label: `verify:${pair.findingIndex + 1}/${candidates.length} vote ${pair.voteIndex + 1}`, phase: 'Verify', schema: voteShape },
      ),
    ),
  )
  votes.push(...results)
}

const verified = []
let rejected = 0
for (let findingIndex = 0; findingIndex < candidates.length; findingIndex++) {
  const cast = votes
    .slice(findingIndex * VOTES, (findingIndex + 1) * VOTES)
    .filter((vote) => vote !== null && typeof vote.refuted === 'boolean')
  if (cast.length < REJECT_AT) {
    unverifiedOverflow++
    gaps.push(`finding ${candidates[findingIndex].file}:${candidates[findingIndex].line} got ${cast.length} of ${VOTES} votes — dropped unverified, never passed by default`)
    continue
  }
  const refutations = cast.filter((vote) => vote.refuted).length
  if (refutations >= REJECT_AT) {
    rejected++
    continue
  }
  verified.push({ ...candidates[findingIndex], confidence: refutations === 0 ? 'high' : 'medium' })
}

const stats = { mapped: mappedCount, verified: verified.length, rejected, unverifiedOverflow }
log(`Verified: ${verified.length} stand, ${rejected} rejected, ${unverifiedOverflow} unverified`)

phase('Synthesize')

// The synthesizer writes ONLY the summary; the findings list is assembled verbatim by the
// reducer, so no model can mutate or add a finding after verification.
const synthesis = await agent(
  `Write the one-paragraph summary of a four-axis code review of \`${range}\`. ` +
    `Say what was covered (axes: ${AXES.join(', ')}) and whether the change is ready to merge.\n\n` +
    `Verified findings (the only ones that survived adversarial verification):\n${JSON.stringify(verified, null, 2)}\n\n` +
    `Stats: ${JSON.stringify(stats)}\n\n` +
    `Do not restate the findings as a list — they travel separately. Judge readiness from their severity and the stats.`,
  { label: 'synthesize:summary', phase: 'Synthesize', schema: summaryShape },
)

let summary
if (synthesis === null) {
  gaps.push('synthesizer failed: summary is a deterministic fallback, not a model judgement')
  summary = `Four-axis review of ${range}: ${stats.verified} verified findings (${stats.rejected} rejected, ${stats.unverifiedOverflow} unverified).`
} else {
  summary = synthesis.summary
}

const reviewFindings = { summary, findings: verified, stats }

for (const field of SCHEMA_ReviewFindings.required) {
  const value = reviewFindings[field]
  if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
    gaps.push(`ReviewFindings.${field} is empty — the run is incomplete`)
  }
}
for (const finding of verified) {
  for (const field of FINDING_REQUIRED) {
    if (finding[field] === undefined || finding[field] === null) {
      gaps.push(`finding ${finding.file}:${finding.line} is missing ${field} — the run is incomplete`)
    }
  }
}

return { reviewFindings, gaps }
