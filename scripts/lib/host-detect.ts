export const HOST_IDS = ["grok-bot", "claude-code", "cursor"] as const;

export type HostId = (typeof HOST_IDS)[number];

export type HostDetectInput = {
  env?: Record<string, string | undefined>;
  tools?: string[];
};

const EXPLICIT_KEYS = ["NERD4RENT_HOST", "AGENT_HOST"] as const;

function isHostId(value: string | undefined): value is HostId {
  return value !== undefined && (HOST_IDS as readonly string[]).includes(value);
}

function set(env: Record<string, string | undefined>, key: string): boolean {
  const value = env[key];
  return value !== undefined && value !== "";
}

function toolNames(tools: string[]): string[] {
  return tools.map((tool) => tool.trim().toLowerCase().replace(/_/g, ""));
}

function hasTool(tools: string[], ...needles: string[]): boolean {
  const names = toolNames(tools);
  return needles.some((needle) => names.some((name) => name === needle || name.includes(needle)));
}

/**
 * Runtime host probe for interactive issue-workflow. First match wins.
 * Does not read the platform config. auto-issue-mode must not call this.
 */
export function detectHost(input: HostDetectInput = {}): HostId {
  const env = input.env ?? {};
  const tools = input.tools ?? [];

  for (const key of EXPLICIT_KEYS) {
    const value = env[key]?.trim();
    if (isHostId(value)) return value;
  }

  if (hasTool(tools, "sendtouser") || set(env, "GROK_BOT")) return "grok-bot";
  if (hasTool(tools, "askuserquestion") || set(env, "CLAUDE_CODE") || set(env, "CLAUDECODE")) {
    return "claude-code";
  }
  if (hasTool(tools, "askquestion", "ask-question") || set(env, "CURSOR_TRACE_ID") || set(env, "CURSOR_AGENT")) {
    return "cursor";
  }

  return "claude-code";
}
