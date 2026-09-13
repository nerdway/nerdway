export const AGENT_PLUGIN_SCHEMA =
  "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const AGENT_PLUGIN_KEYS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

const CURSOR_PLUGIN_KEYS = new Set([
  "name",
  "displayName",
  "description",
  "version",
  "minClientVersions",
  "author",
  "publisher",
  "homepage",
  "repository",
  "license",
  "logo",
  "keywords",
  "category",
  "tags",
  "commands",
  "agents",
  "skills",
  "rules",
  "hooks",
  "variables",
  "mcpServers",
]);

export type ManifestSet = {
  claudePlugin: Record<string, unknown>;
  marketplace: Record<string, unknown>;
  agentPlugin: Record<string, unknown>;
  cursorPlugin: Record<string, unknown>;
};

function versionOf(value: unknown, path: string): { version: string; errors: string[] } {
  if (typeof value !== "string" || value.length === 0) {
    return { version: "", errors: [`${path}: version is missing`] };
  }
  return { version: value, errors: [] };
}

function extraKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${label}: unknown field "${key}"`);
}

export function validateManifests(set: ManifestSet): string[] {
  const errors: string[] = [];

  const claude = versionOf(set.claudePlugin.version, ".claude-plugin/plugin.json");
  const market = versionOf(
    (set.marketplace.metadata as { version?: unknown } | undefined)?.version,
    ".claude-plugin/marketplace.json metadata.version",
  );
  const agent = versionOf(set.agentPlugin.version, "plugin.json");
  const cursor = versionOf(set.cursorPlugin.version, ".cursor-plugin/plugin.json");

  errors.push(...claude.errors, ...market.errors, ...agent.errors, ...cursor.errors);

  const versions = [claude.version, market.version, agent.version, cursor.version];
  const present = versions.filter((value) => value.length > 0);
  if (present.length === 4 && new Set(present).size > 1) {
    errors.push(
      [
        "manifest versions disagree:",
        `  - .claude-plugin/plugin.json version: ${claude.version}`,
        `  - .claude-plugin/marketplace.json metadata.version: ${market.version}`,
        `  - plugin.json version: ${agent.version}`,
        `  - .cursor-plugin/plugin.json version: ${cursor.version}`,
      ].join("\n"),
    );
  }

  if (set.agentPlugin.$schema !== AGENT_PLUGIN_SCHEMA) {
    errors.push(`plugin.json: $schema must be ${AGENT_PLUGIN_SCHEMA}`);
  }
  if (typeof set.agentPlugin.name !== "string" || set.agentPlugin.name.length === 0) {
    errors.push("plugin.json: name is missing");
  }
  errors.push(...extraKeys(set.agentPlugin, AGENT_PLUGIN_KEYS, "plugin.json (agent plugin)"));

  if (typeof set.cursorPlugin.name !== "string" || set.cursorPlugin.name.length === 0) {
    errors.push(".cursor-plugin/plugin.json (cursor plugin): name is missing");
  }
  errors.push(...extraKeys(set.cursorPlugin, CURSOR_PLUGIN_KEYS, ".cursor-plugin/plugin.json (cursor plugin)"));

  return errors;
}
