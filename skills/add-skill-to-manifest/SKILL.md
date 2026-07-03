---
name: add-skill-to-manifest
description: >-
  Add a skill (and, if needed, its source repo) to the agent-skills manifest
  at ~/.config/agent-skills/manifest.json — the whitelist that
  agent-skills-sync.sh/.ps1 install for Claude Code, Cursor, and any other
  detected coding agent. Use for `/nerd4rent:add-skill-to-manifest`, or
  phrases like "add this skill to the manifest", "track this skill for all my
  agents", "install X for Cursor too". Ends by handing off to
  apply-manifest-changes.
---

# add-skill-to-manifest: register a new skill in manifest.json

Edits `~/.config/agent-skills/manifest.json` only. It never touches the live
system directly — see `apply-manifest-changes` for that.

## 1. Locate the manifest

Default path: `~/.config/agent-skills/manifest.json`, overridable via
`$AGENT_SKILLS_MANIFEST`. If it doesn't exist, stop and tell the user — this
skill edits an existing manifest, it doesn't bootstrap one.

## 2. Work out what's being added

Ask (or infer from what the user already said):

- **The source repo** — `owner/repo` form, e.g. `mattpocock/skills`.
- **The skill name(s)** to add from that repo.

Then decide which of two shapes this is:

**A. Plain skill repo (the common case).** A repo of flat `skills/*/SKILL.md`
directories with no Claude Code plugin manifest — e.g. `mattpocock/skills`,
`kepano/obsidian-skills`, `supabase/agent-skills`. These go under
`portableSkillSources`, installed via `npx skills`.

**B. Claude Code plugin marketplace.** A repo with a
`.claude-plugin/marketplace.json` — installable via `claude plugin install`.
These go under `claudeMarketplaces` + `claudePlugins`, installed natively for
Claude Code.

If unsure which it is, ask the user, or check: `npx skills add <repo> -l`
finds flat skills (shape A); a marketplace.json in the repo root under
`.claude-plugin/` means shape B. A repo can be both (e.g. `linear-skills`,
`nerd4rent-claude-plugin` in *this* manifest are shape B for Claude and also
listed under `portableSkillSources` with `includeClaudeCode: false` so
non-Claude agents get them too via `npx skills`) — ask whether the user wants
that dual treatment if the repo looks like it qualifies.

## 3. Validate before writing

**Never add a skill name you haven't confirmed exists.** Run:

```
npx --yes skills add <repo> -l
```

and check the exact skill name(s) appear in the printed list. Names get
renamed/retired upstream over time (this has already happened once in this
manifest — see the `mattpocock/skills` `_comment` for the history) — always
re-verify against the live repo, don't trust a name the user typed from
memory.

For shape B, there's no dry-list equivalent — `claude plugin marketplace add
<repo>` itself is idempotent and safe to run as validation (it will error
clearly if the repo isn't a valid marketplace).

## 4. Edit the manifest

**Shape A — plain skill repo:**
- If `portableSkillSources` already has an entry for this `repo`, append the
  new skill name(s) to its `skills` array (dedupe — don't add a name that's
  already there).
- Otherwise, add a new entry:
  ```json
  {
    "repo": "<owner>/<repo>",
    "skills": ["<skill-name>", ...],
    "includeClaudeCode": true
  }
  ```
  Set `includeClaudeCode: false` only if Claude already gets this repo's
  content through a `claudeMarketplaces`/`claudePlugins` entry (shape B dual
  case above) — otherwise `true`, since a plain skill repo has no other way
  to reach Claude Code.

**Shape B — Claude plugin marketplace:**
- Add to `claudeMarketplaces` if not already present:
  ```json
  { "name": "<marketplace-name>", "repo": "<owner>/<repo>" }
  ```
  (`<marketplace-name>` is whatever `claude plugin marketplace add` registers
  it as — usually the repo name; confirm from its output.)
- Add the plugin id(s) to `claudePlugins`, in `name@marketplace` form, e.g.
  `"my-plugin@my-marketplace"`.

Use `Edit` on the manifest file directly. After writing, validate the file is
still well-formed JSON (e.g. `jq empty <path>` or equivalent) before moving on.

## 5. Show a summary and confirm

Show the user exactly what changed in the manifest (the added lines are
enough — no need to dump the whole file). Then **ask: "Apply these changes
now?"**

- If yes → invoke the `apply-manifest-changes` skill.
- If no → stop here; the manifest edit is saved but nothing on the live
  system changes until they run it.
