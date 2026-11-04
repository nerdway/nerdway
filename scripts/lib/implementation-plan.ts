export const IMPLEMENTATION_PLAN_HEADING = "## Implementation plan";

export const UNPLANNED_PHASES = ["backlog", "todo", "in-progress"] as const;

export type UnplannedPhase = (typeof UNPLANNED_PHASES)[number];

export type PlanComment = { body?: string } | string;

function commentBody(comment: PlanComment): string {
  return typeof comment === "string" ? comment : (comment.body ?? "");
}

export function commentFirstLine(body: string): string {
  const first = body.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  return first === undefined ? "" : first.trim();
}

export function hasImplementationPlanComment(comments: readonly PlanComment[]): boolean {
  return comments.some((comment) => commentFirstLine(commentBody(comment)) === IMPLEMENTATION_PLAN_HEADING);
}

export function isUnplannedPhase(phase: string): phase is UnplannedPhase {
  return (UNPLANNED_PHASES as readonly string[]).includes(phase);
}

export function isUnplannedIssue(input: { phase: string; comments: readonly PlanComment[] }): boolean {
  return isUnplannedPhase(input.phase) && !hasImplementationPlanComment(input.comments);
}
