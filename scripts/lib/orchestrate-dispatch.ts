import { type HostId } from "./host-detect.ts";

export const ORCHESTRATE_PARALLEL_CAP = 2;

export type AimDispatch = {
  maxParallel: number;
  worktrees: boolean;
  cloudAgent: boolean;
};

export function aimDispatchForHost(host: HostId, worktreeAvailable: boolean): AimDispatch {
  if (host === "grok-bot") {
    return { maxParallel: 1, worktrees: false, cloudAgent: true };
  }
  if (worktreeAvailable) {
    return { maxParallel: ORCHESTRATE_PARALLEL_CAP, worktrees: true, cloudAgent: false };
  }
  return { maxParallel: 1, worktrees: false, cloudAgent: false };
}
