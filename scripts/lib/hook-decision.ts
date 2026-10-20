import type { Runtime } from "./install-check.ts";

export interface DenyMessages {
  agent: string;
  user: string;
}

export function renderDeny(runtime: Runtime, messages: DenyMessages): string {
  if (runtime === "claude") {
    return JSON.stringify({
      systemMessage: messages.user,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: messages.agent,
      },
    });
  }
  return JSON.stringify({ permission: "deny", user_message: messages.user, agent_message: messages.agent });
}

export function renderAllow(runtime: Runtime): string {
  return runtime === "claude" ? "" : JSON.stringify({ permission: "allow" });
}
