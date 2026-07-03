---
name: remove-skill-from-manifest
description: >-
  Remove a skill, or an entire source, from the agent-skills manifest at
  ~/.config/agent-skills/manifest.json. Use for
  `/nerd4rent:remove-skill-from-manifest`, or phrases like "remove this skill
  from the manifest", "stop installing X for my agents", "drop this
  marketplace". Ends by handing off to apply-manifest-changes, which is what
  actually uninstalls it from the live system.
---

# remove-skill-from-manifest: drop a skill from manifest.json

Edits `~/.config/agent-skills/manifest.json` only. Removing something from
the manifest does **not** by itself uninstall it from the live system —
that only happens when `apply-manifest-changes` runs `--reconcile`
afterwards, which is why this skill always ends by offering to invoke it.

## 1. Locate the manifest

Default path: `~/.config/agent-skills/manifest.json`, overridable via
`$AGENT_SKILLS_MANIFEST`.

## 2. Identify what to remove

If the user didn't name it precisely, read the manifest and show them the
current inventory: every string in `claudePlugins`, and every
`repo` → `skills` pair in `portableSkillSources`. Let them pick.

## 3. Remove it

**If it's a `claudePlugins` entry** (`"name@marketplace"` string):
- Delete that string from the array.
- Check whether any other entry in `claudePlugins` still references the same
  `@marketplace`. If none do, ask the user whether to also remove the
  corresponding entry from `claudeMarketplaces` — don't do it silently, an
  empty marketplace with no plugins is harmless to leave registered if they
  plan to add something else to it soon.

**If it's a skill inside a `portableSkillSources[].skills` array:**
- Delete that name from the array.
- If the array is now empty, ask the user whether to remove the whole
  `portableSkillSources` entry for that repo — an entry with an empty
  `skills` list has nothing left to install.

Use `Edit` on the manifest file directly. Validate the result is still
well-formed JSON afterwards.

## 4. Show a summary and confirm

Show exactly what was removed. Then **ask: "Apply these changes now?"**
Be explicit that this is the step that actually uninstalls it live — until
`apply-manifest-changes` runs, the skill/plugin stays installed even though
the manifest no longer lists it.

- If yes → invoke the `apply-manifest-changes` skill.
- If no → stop here.

## Notes

- Reconciliation (`apply-manifest-changes` → `--reconcile`) only removes
  things whose source is *still tracked* in the manifest (i.e. the
  marketplace or repo entry itself still exists) but whose specific
  plugin/skill name is no longer listed under it. If you remove an entire
  `portableSkillSources` entry, or an entire `claudeMarketplaces` entry, the
  removed skills/plugins are no longer attributable to a tracked source, so
  reconcile mode won't clean them up automatically — mention this to the
  user and offer to remove them directly as part of this same confirmed
  action (`npx skills remove <name> -g -y -a '*'` for skills, `claude plugin
  uninstall <name>@<marketplace> -y` then `claude plugin marketplace remove
  <marketplace>` for a Claude plugin), or point them at the full-reset mode
  of `agent-skills-sync.sh` if they'd rather do a complete wipe-and-rebuild.
