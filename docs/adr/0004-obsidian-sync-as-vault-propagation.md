# Obsidian Sync as the vault propagation channel; no git on the vault

*Supersedes ADR-0002 (DEMO-297).*

*Amended by ADR-0010 (DEMO-450): the frozen rule `vault-filesystem-only` and the `settings-deny` gates named below are gone from `workflow-graph.json`, and the MCP/REST prohibition is lifted. The git prohibition is unchanged and stays a prose rule.*

*Amended by DEMO-300: linear-continue is now project-continue.*

Wiki writes are filesystem-only: a skill mutates the vault with `Read` /
`Edit` / `Write` and stops there. Propagation between machines is Obsidian
Sync, and no git command is ever run against the vault — not `pull`, not
`commit`, not `push`. ADR-0002 had made git the sync backbone for wiki writes;
DEMO-218 (PR #12, `86e491a`, 2026-07-24) removed that protocol from
`nerdbrain-wiki`, so the code has not implemented ADR-0002 since. The git
prohibition itself is a prose rule: the hard rules in `~/.claude/CLAUDE.md`
("propagation happens via Obsidian Sync, not git; skills must not run git
against the vault"). It sits beside the mechanically enforced half of the same
policy — the deny rules in `settings.json` and the frozen rule
`vault-filesystem-only` in `workflow-graph.json` (the `settings-deny` gate of
the `wiki-write` node), which block the Obsidian/Linear MCP and the Local REST
API but say nothing about git.

This is the first written record of the decision. The DEMO-218 commit message
cites "ADR-0003 (Obsidian Sync, 2026-07-14)", but no such ADR was ever written
— not in this repo, not in `~/.claude/docs/adr/`, not in the vault — and the
number 0003 in this repo belongs to the workflow-graph contract (DEMO-245).
Between DEMO-218 and this ADR the decision lived only in the prose of
`skills/nerdbrain-wiki/SKILL.md`.

## Considered Options

- **Keep git on the `file` tier alongside Sync** — rejected: two propagation
  channels for one vault, and every session would carry the standing risk of a
  rebase conflict against changes Sync had already delivered.
- **Git protocol on servers only, Sync on desktops** — rejected: it brings back
  the two-recipe split that ADR-0001 exists to remove.

## Consequences

- Skills never run git against the vault; a wiki write is complete once the
  files are on disk.
- Sync conflicts are not detected by any skill. Obsidian surfaces them as
  conflict files, and the user resolves them in the app.
- A delayed Sync shows up as checkpoint drift on another machine, which
  `linear-continue` (DEMO-296) reports when it verifies the newest checkpoint
  against git and Linear.
