import type { ProbeResult } from "./probe.ts";

export type Status =
  | "OK"
  | "INSTALLED"
  | "UPDATED"
  | "FAILED"
  | "NEEDS_PATH"
  | "NEEDS_AUTH"
  | "UNKNOWN"
  | "UNSUPPORTED"
  | "MISSING"
  | "OUTDATED";

export interface Outcome {
  id: string;
  status: Status;
  detail: string;
}

export const SATISFIED: readonly Status[] = ["OK", "INSTALLED", "UPDATED"];

export function decideAfterInstall(before: "missing" | "outdated", after: ProbeResult, placed: boolean): Status {
  if (after.status === "ok") return before === "missing" ? "INSTALLED" : "UPDATED";
  if (placed) return after.status === "missing" ? "NEEDS_PATH" : "FAILED";
  return "FAILED";
}

export function formatReport(outcomes: Outcome[]): string {
  const width = Math.max(...outcomes.map((outcome) => outcome.id.length));
  const lines = outcomes.map((outcome) => {
    const marker = SATISFIED.includes(outcome.status) ? " " : "!";
    return `${marker} ${outcome.id.padEnd(width)}  ${outcome.status.padEnd(11)}  ${outcome.detail}`;
  });
  const failing = outcomes.filter((outcome) => !SATISFIED.includes(outcome.status));
  const summary = failing.length === 0
    ? `all ${outcomes.length} entries satisfied`
    : `${failing.length} of ${outcomes.length} entries need attention`;
  return [...lines, "", summary].join("\n");
}
