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
  const cursor = versionOf(set.cursorPlugin.version, ".cursor-plugin/plugin.json");

  errors.push(...claude.errors, ...market.errors, ...cursor.errors);

  const versions = [claude.version, market.version, cursor.version];
  const present = versions.filter((value) => value.length > 0);
  if (present.length === 3 && new Set(present).size > 1) {
    errors.push(
      [
        "manifest versions disagree:",
        `  - .claude-plugin/plugin.json version: ${claude.version}`,
        `  - .claude-plugin/marketplace.json metadata.version: ${market.version}`,
        `  - .cursor-plugin/plugin.json version: ${cursor.version}`,
      ].join("\n"),
    );
  }

  if (typeof set.cursorPlugin.name !== "string" || set.cursorPlugin.name.length === 0) {
    errors.push(".cursor-plugin/plugin.json (cursor plugin): name is missing");
  }
  errors.push(...extraKeys(set.cursorPlugin, CURSOR_PLUGIN_KEYS, ".cursor-plugin/plugin.json (cursor plugin)"));

  return errors;
}
