export interface PlanLimits {
  maxRelatedPages: number;
  maxPriorArt: number;
}

export interface GathererStats {
  source: string;
  returned: number;
  unique: number;
}

export interface PlanStats {
  gatherers: GathererStats[];
  duplicatesDropped: number;
  gapsCount: number;
}

export interface PlanContext {
  repoLayout: string;
  conventions: string[];
  priorArt: string[];
  commands: string[];
  stats?: PlanStats;
}

export interface ProjectContext {
  slug: string;
  decisions: string[];
  activeContext: string;
  relatedPages: string[];
}

export interface StringList {
  items?: unknown;
}

export interface RepoFacts {
  repoLayout?: unknown;
  commands?: unknown;
}

export interface VaultOutput {
  slug?: unknown;
  decisions?: unknown;
  activeContext?: unknown;
  relatedPages?: unknown;
}

export interface PlanGathererOutput {
  repoFacts: RepoFacts | null;
  conventions: StringList | null;
  priorPlans: StringList | null;
  trackerRelations: StringList | null;
  vault: VaultOutput | null;
}

export interface PlanReduceResult {
  planContext: PlanContext & { stats: PlanStats };
  projectContext: ProjectContext | null;
  gaps: string[];
}

const PLAN_SOURCES = ["repo-layout", "conventions", "prior-plans", "tracker-relations", "vault"] as const;

const PLAN_CONTEXT_REQUIRED: ReadonlyArray<keyof PlanContext> = ["repoLayout", "conventions"];

const PROJECT_CONTEXT_REQUIRED: ReadonlyArray<keyof ProjectContext> = ["slug", "decisions"];

function asStringList(items: unknown): unknown[] {
  return Array.isArray(items) ? items : [];
}

function missingRequired<T extends object>(required: ReadonlyArray<keyof T>, value: T): string[] {
  return required.filter((field) => {
    const v = value[field];
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim().length === 0;
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }) as string[];
}

export function reducePlanContext(output: PlanGathererOutput, limits: PlanLimits): PlanReduceResult {
  const gaps: string[] = [];
  const tally = new Map<string, GathererStats>(PLAN_SOURCES.map((source) => [source, { source, returned: 0, unique: 0 }]));

  function reduce(entries: Array<{ source: string; items: unknown }>, limit?: number): string[] {
    const seen = new Set<string>();
    const values: string[] = [];
    const owners: GathererStats[] = [];
    for (const entry of entries) {
      const row = tally.get(entry.source);
      if (row === undefined) continue;
      for (const item of asStringList(entry.items)) {
        if (typeof item !== "string") continue;
        const trimmed = item.trim();
        if (trimmed.length === 0) continue;
        row.returned++;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        values.push(trimmed);
        owners.push(row);
      }
    }
    const kept = limit === undefined ? values : values.slice(0, limit);
    for (const row of owners.slice(0, kept.length)) row.unique++;
    return kept;
  }

  const { repoFacts, conventions, priorPlans, trackerRelations, vault } = output;

  if (repoFacts === null) gaps.push("repo-layout gatherer failed: repoLayout and commands are missing");
  if (conventions === null) gaps.push("conventions gatherer failed: CONTEXT.md/ADR constraints are missing");
  if (priorPlans === null) gaps.push("prior-plans gatherer failed: docs/superpowers/plans precedents are missing");
  if (trackerRelations === null) gaps.push("tracker-relations gatherer failed: related issues are missing");

  const planContext: PlanContext = {
    repoLayout: repoFacts !== null && typeof repoFacts.repoLayout === "string" ? repoFacts.repoLayout.trim() : "",
    conventions: reduce([{ source: "conventions", items: conventions !== null ? conventions.items : [] }]),
    priorArt: reduce(
      [
        { source: "prior-plans", items: priorPlans !== null ? priorPlans.items : [] },
        { source: "tracker-relations", items: trackerRelations !== null ? trackerRelations.items : [] },
      ],
      limits.maxPriorArt,
    ),
    commands: reduce([{ source: "repo-layout", items: repoFacts !== null ? repoFacts.commands : [] }]),
  };
  for (const field of missingRequired(PLAN_CONTEXT_REQUIRED, planContext)) {
    gaps.push(`PlanContext.${field} is empty — degrade to the sequential context read for that part`);
  }

  let projectContext: ProjectContext | null = null;
  if (vault === null) {
    gaps.push("vault gatherer failed (vault unreachable or no entity page): ProjectContext is absent");
  } else {
    const candidate: ProjectContext = {
      slug: typeof vault.slug === "string" ? vault.slug.trim() : "",
      decisions: reduce([{ source: "vault", items: vault.decisions }]),
      activeContext: typeof vault.activeContext === "string" ? vault.activeContext.trim() : "",
      relatedPages: reduce([{ source: "vault", items: vault.relatedPages }], limits.maxRelatedPages),
    };
    const missing = missingRequired(PROJECT_CONTEXT_REQUIRED, candidate);
    if (missing.length > 0) {
      gaps.push(`ProjectContext incomplete (${missing.join(", ")} empty) — treat vault context as partial`);
    } else {
      projectContext = candidate;
    }
  }

  const gatherers = [...tally.values()];
  planContext.stats = {
    gatherers,
    duplicatesDropped: gatherers.reduce((total, row) => total + row.returned - row.unique, 0),
    gapsCount: gaps.length,
  };

  return { planContext, projectContext, gaps };
}

export const REVIEW_AXES = ["spec-compliance", "repo-standards", "correctness-regressions", "security"] as const;
export type ReviewAxis = (typeof REVIEW_AXES)[number];

export const SEVERITIES = ["critical", "major", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

export interface MappedFinding {
  file?: unknown;
  line?: unknown;
  claim?: unknown;
  evidence?: unknown;
  severity?: unknown;
}

export interface CandidateFinding {
  axis: ReviewAxis;
  file: string;
  line: number;
  claim: string;
  evidence: string;
  severity: Severity;
}

export interface Vote {
  refuted: unknown;
  justification?: unknown;
}

export interface VerifiedFinding extends CandidateFinding {
  confidence: "high" | "medium";
}

export interface ReviewLimits {
  votes: number;
  rejectAt: number;
  maxVerifiedFindings: number;
}

export interface MappedReduceResult {
  candidates: CandidateFinding[];
  overflow: CandidateFinding[];
  mappedCount: number;
  gaps: string[];
}

export interface VerdictsReduceResult {
  verified: VerifiedFinding[];
  stats: { mapped: number; verified: number; rejected: number; unverifiedOverflow: number };
  gaps: string[];
}

function isWellFormed(finding: MappedFinding): finding is MappedFinding & {
  file: string;
  line: number;
  claim: string;
  evidence: string;
  severity: Severity;
} {
  if (typeof finding !== "object" || finding === null) return false;
  if (typeof finding.file !== "string" || finding.file.trim().length === 0) return false;
  if (!Number.isInteger(finding.line)) return false;
  if (typeof finding.claim !== "string" || finding.claim.trim().length === 0) return false;
  if (typeof finding.evidence !== "string" || finding.evidence.trim().length === 0) return false;
  return SEVERITIES.includes(finding.severity as Severity);
}

export function reduceMappedFindings(
  mapped: unknown[],
  axes: ReadonlyArray<ReviewAxis>,
  limits: ReviewLimits,
): MappedReduceResult {
  const gaps: string[] = [];
  let mappedCount = 0;
  const deduped: CandidateFinding[] = [];
  const anchorIndex = new Map<string, number>();

  for (let i = 0; i < axes.length; i++) {
    const axis = axes[i];
    const result = mapped[i];
    if (result === null || typeof result !== "object") {
      gaps.push(`${axis} mapper failed: the axis is missing from this run`);
      continue;
    }
    const findings = (result as { findings?: unknown }).findings;
    if (!Array.isArray(findings)) continue;
    mappedCount += findings.length;
    for (const finding of findings as MappedFinding[]) {
      if (!isWellFormed(finding)) continue;
      const anchor = `${finding.file.trim()}:${finding.line}`;
      const entry: CandidateFinding = {
        axis,
        file: finding.file.trim(),
        line: finding.line,
        claim: finding.claim.trim(),
        evidence: finding.evidence.trim(),
        severity: finding.severity,
      };
      const at = anchorIndex.get(anchor);
      if (at === undefined) {
        anchorIndex.set(anchor, deduped.length);
        deduped.push(entry);
      } else if (SEVERITY_RANK[entry.severity] < SEVERITY_RANK[deduped[at].severity]) {
        deduped[at] = entry;
      }
    }
  }

  const ordered = deduped
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.index - b.index)
    .map((entry) => entry.finding);

  const candidates = ordered.slice(0, limits.maxVerifiedFindings);
  const overflow = ordered.slice(limits.maxVerifiedFindings);

  return { candidates, overflow, mappedCount, gaps };
}

export function reduceVerdicts(
  candidates: CandidateFinding[],
  votes: Array<Vote | null>,
  limits: ReviewLimits,
): VerdictsReduceResult {
  const gaps: string[] = [];
  const verified: VerifiedFinding[] = [];
  let rejected = 0;
  let unverifiedOverflow = 0;

  for (let findingIndex = 0; findingIndex < candidates.length; findingIndex++) {
    const cast = votes
      .slice(findingIndex * limits.votes, (findingIndex + 1) * limits.votes)
      .filter((vote) => vote !== null && typeof vote.refuted === "boolean");
    if (cast.length < limits.rejectAt) {
      unverifiedOverflow++;
      gaps.push(
        `finding ${candidates[findingIndex].file}:${candidates[findingIndex].line} got ${cast.length} of ${limits.votes} votes — dropped unverified, never passed by default`,
      );
      continue;
    }
    const refutations = cast.filter((vote) => (vote as { refuted: boolean }).refuted).length;
    if (refutations >= limits.rejectAt) {
      rejected++;
      continue;
    }
    verified.push({ ...candidates[findingIndex], confidence: refutations === 0 ? "high" : "medium" });
  }

  return {
    verified,
    stats: {
      mapped: candidates.length,
      verified: verified.length,
      rejected,
      unverifiedOverflow,
    },
    gaps,
  };
}
