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

export const CLAUDE_CODE_CONVENTION_PATHS = ["hooks/hooks.json", "plugin.json"] as const;
export const CLAUDE_CODE_HOOKS_PATH = "hooks/hooks.json";
const CLAUDE_CODE_HOOK_EVENT = /^[A-Z][A-Za-z]+$/;

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

function normalise(path: string): string {
  return path.replace(/^\.\//, "");
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

function isClaudeCodeHooksFile(content: unknown): boolean {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return false;
  const file = content as Record<string, unknown>;
  if ("version" in file) return false;
  const hooks = file.hooks;
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) return false;
  const events = Object.keys(hooks);
  return events.length > 0 && events.every((event) => CLAUDE_CODE_HOOK_EVENT.test(event));
}

export function validateClaudeCodeIsolation(
  cursorPlugin: Record<string, unknown>,
  exists: (path: string) => boolean,
  readJson: (path: string) => unknown = () => null,
): string[] {
  const errors: string[] = [];

  for (const path of CLAUDE_CODE_CONVENTION_PATHS) {
    if (!exists(path)) continue;
    if (path === CLAUDE_CODE_HOOKS_PATH && isClaudeCodeHooksFile(readJson(path))) continue;
    errors.push(
      `${path}: Claude Code reads this path by convention — keep Cursor and other runtimes' files out of it`,
    );
  }

  const hooks = cursorPlugin.hooks;
  if (typeof hooks !== "string" || hooks.length === 0) {
    errors.push(
      ".cursor-plugin/plugin.json: hooks must name the Cursor hooks file explicitly, or Cursor falls back to hooks/hooks.json",
    );
  } else if ((CLAUDE_CODE_CONVENTION_PATHS as readonly string[]).includes(normalise(hooks))) {
    errors.push(`.cursor-plugin/plugin.json: hooks "${hooks}" is a path Claude Code auto-discovers`);
  }

  for (const key of ["skills", "agents", "hooks"] as const) {
    const value = cursorPlugin[key];
    if (typeof value === "string" && value.length > 0 && !exists(normalise(value))) {
      errors.push(`.cursor-plugin/plugin.json: ${key} path "${value}" does not exist`);
    }
  }

  return errors;
}
