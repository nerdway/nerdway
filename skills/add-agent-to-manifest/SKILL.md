---
name: add-agent-to-manifest
description: >-
  Add a new coding agent (Cursor, Windsurf, Zed, etc.) to the agent-skills
  manifest at ~/.config/agent-skills/manifest.json, either as an
  always-installed target or as an auto-detected one. Use for
  `/nerd4rent:add-agent-to-manifest`, or phrases like "add support for
  <agent>", "detect <agent> too", "install skills for <agent>". Ends by
  handing off to apply-manifest-changes.
---

# add-agent-to-manifest: register a new agent in manifest.json

Edits `~/.config/agent-skills/manifest.json` only. `apply-manifest-changes`
is what actually installs the manifest's `portableSkillSources` skills into
the newly-added agent's directories.

## 1. Locate the manifest

Default path: `~/.config/agent-skills/manifest.json`, overridable via
`$AGENT_SKILLS_MANIFEST`.

## 2. Get the agent id and validate it

Ask which agent to add if not given. The id must match what `npx skills`
itself recognizes — **don't guess a slug**. Get the canonical, current list
by deliberately triggering the CLI's own validation error:

```
npx --yes skills add <any-repo-already-in-manifest> -a __invalid__ -s __invalid__ -y
```

It fails fast (before cloning matters) and its stderr prints `Valid agents:`
followed by the full current list. Confirm the requested id is an exact,
case-sensitive match. If not, look for the closest match in that list and
confirm with the user before proceeding — this list changes over time as the
`skills` CLI adds support for new agents, so don't rely on a previously
memorized list.

## 3. Decide: always-on or auto-detected?

Ask the user (or infer from context):

- **Always-on** (`alwaysAgents`): installed unconditionally on every machine
  this manifest runs on, regardless of whether the agent is actually present.
  Use this for agents the user explicitly wants everywhere (this is how
  `cursor` and `claude-code` are configured today).
- **Auto-detected** (`agentDetection`): only installed on machines where the
  agent is actually found. Needs at least one detection probe:
  - `commands`: binary name(s) checked via PATH (works cross-platform).
  - `macApps`: app bundle name(s) checked under `/Applications` (macOS only).
  - `windowsDirs`: directory name(s) checked under
    `%LOCALAPPDATA%\Programs` (Windows only).

  Ask the user what the agent's CLI binary is called (if any) and/or its
  macOS/Windows install location, so the probe actually fires. A `commands`
  entry alone is usually enough and is the simplest to get right.

## 4. Edit the manifest

**Always-on:** append the agent id to the `alwaysAgents` array (dedupe).

**Auto-detected:** add a new key to `agentDetection`:

```json
"my-agent": {
  "commands": ["my-agent-cli"],
  "macApps": ["MyAgent.app"],
  "windowsDirs": ["MyAgent"]
}
```

Omit whichever of `commands`/`macApps`/`windowsDirs` don't apply — none are
required, but at least one should be present or the agent will never be
detected.

Use `Edit` on the manifest file directly. Validate the result is still
well-formed JSON afterwards.

## 5. Show a summary and confirm

Show what was added. Then **ask: "Apply these changes now?"**

- If yes → invoke the `apply-manifest-changes` skill. Note for the user: this
  will install every `portableSkillSources` skill (marked
  `includeClaudeCode` or not, as applicable) into the new agent's directory
  in one pass — that's expected, not a side effect to double-check for.
- If no → stop here.
