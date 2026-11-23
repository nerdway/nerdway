import { detectHost, type HostId } from "./host-detect.ts";

export type MachineKind = "workstation" | "remote";
export type MachineReason = "override" | "remote-signal" | "chat-host" | "local-host";

export interface MachineInput {
  env: Record<string, string | undefined>;
  host?: HostId;
}

export interface Machine {
  kind: MachineKind;
  reason: MachineReason;
}

const CHAT_HOSTS: readonly HostId[] = ["slack-thread", "grok-bot"];

function set(env: Record<string, string | undefined>, key: string): boolean {
  const value = env[key]?.trim();
  return value !== undefined && value.length > 0;
}

function remoteSignal(env: Record<string, string | undefined>): boolean {
  if (env.CLAUDE_CODE_REMOTE?.trim().toLowerCase() === "true") return true;
  if (env.CODESPACES?.trim().toLowerCase() === "true") return true;
  return ["CURSOR_AGENT_WORKER_ID", "CURSOR_WORKER_POOL_NAME", "CLOUD_AGENT_INJECTED_SECRET_NAMES"].some((key) => set(env, key));
}

/**
 * Whether this session runs on a user workstation or on a remote agent
 * machine. First match wins: `NERDWAY_MACHINE`, a known remote signal
 * (cloud sessions and workers), a chat host, else a local host is a
 * workstation. Only a workstation holds the live wiki.
 */
export function detectMachine(input: MachineInput): Machine {
  const env = input.env;
  const override = env.NERDWAY_MACHINE?.trim().toLowerCase();
  if (override === "workstation" || override === "remote") return { kind: override, reason: "override" };
  if (remoteSignal(env)) return { kind: "remote", reason: "remote-signal" };
  const host = input.host ?? detectHost({ env });
  if (CHAT_HOSTS.includes(host)) return { kind: "remote", reason: "chat-host" };
  return { kind: "workstation", reason: "local-host" };
}
