---
name: apply-manifest-changes
description: >-
  Push the agent-skills manifest.json (~/.config/agent-skills/manifest.json)
  to the live system: adds whatever it lists that isn't installed yet, and
  removes only things that came from a source the manifest tracks and are no
  longer listed. Invoke this after editing manifest.json by hand, or when
  another skill (add-skill-to-manifest, remove-skill-from-manifest,
  add-agent-to-manifest) asks to apply its changes. Also use for
  `/nerd4rent:apply-manifest-changes` or phrases like "apply the manifest",
  "sync my skills", "reconcile agent skills".
---

# apply-manifest-changes: sync the live system to manifest.json

This is the **only** skill in this group that touches the live system. The
other three (`add-skill-to-manifest`, `remove-skill-from-manifest`,
`add-agent-to-manifest`) only edit the JSON file and then hand off here.

## Prerequisites

This assumes the personal agent-skills tooling is already provisioned on this
machine:

- `~/.config/agent-skills/manifest.json` (or `$AGENT_SKILLS_MANIFEST`)
- `~/.local/bin/agent-skills-sync.sh` (macOS/Linux) or
  `~/.local/bin/agent-skills-sync.ps1` (Windows)

If either is missing, stop and say so plainly — don't try to reconstruct them
from scratch here. (They're chezmoi-managed dotfiles; the user provisions a
new machine by applying their dotfiles, not through this skill.)

## Process

1. **Pick the right script for the OS.** macOS/Linux →
   `~/.local/bin/agent-skills-sync.sh --reconcile`. Windows →
   `pwsh ~/.local/bin/agent-skills-sync.ps1 -Reconcile`.

2. **Always dry-run first.** Run with `--dry-run` / `-DryRun` added and show
   the user the plan: which marketplaces/plugins/skills will be added, and —
   just as importantly — which will be *removed*. The reconcile mode only
   removes things whose source (marketplace or repo) is tracked in the
   manifest, so it never touches anything outside this system's scope, but
   the user should still see it before it happens.

3. **Ask for confirmation** ("Apply these changes now?" / "Zastosować teraz?")
   before running for real. This is a live-system mutation (Claude Code
   plugins get installed/uninstalled, cross-agent skill directories get
   written to) — always gate it, even when called from another skill that
   already asked once. Don't chain confirmations silently.

4. **Run for real** (drop `--dry-run`/`-DryRun`) once confirmed.

5. **Report the outcome** — what got added, what got removed, and any
   warnings the script printed (failed installs are non-fatal and logged,
   not raised as errors, so check the output rather than just the exit code).

6. If any Claude Code plugin was installed, uninstalled, or enabled, **tell
   the user to restart Claude Code** for the change to take effect — plugin
   changes don't apply to the running session.

## Notes

- `--reconcile` is intentionally *not* the destructive full-reset mode
  (bare `agent-skills-sync.sh` with no flags wipes every Claude plugin and
  every cross-agent skill on the system before reinstalling). Never suggest
  the full-reset mode from this skill unless the user explicitly asks for a
  complete wipe-and-rebuild — that's a much bigger blast radius than
  "I edited the manifest, make it real."
- If `claude` or `npx` isn't on PATH, the script skips that half gracefully
  and warns — surface that warning to the user rather than assuming the
  step succeeded silently.
