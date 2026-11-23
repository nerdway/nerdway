# Live wiki and the pending queue

*2026-11-23.*

#31 closes a gap in the close-out: personal guides and Checkpoints
entries vanished. A remote session (a cloud agent, a chat bot's box, a
sandbox) wrote them into its own copy of the wiki directory, reported
"written", and the issue went to Done. The copy never reached the user.

**A guide or Checkpoints entry is written only to the live wiki: the
directory `resolveVault` returns, on a user workstation. It counts only
after `verify-vault-file.ts` passed there, and the verify line is posted on
the issue. With no live wiki reachable, the full text is queued on the
issue as a `## Pending guide` or `## Pending checkpoint` comment, the PR
merges with the non-closing `Refs <ID>`, and the issue stays In Review
until a workstation session drains the queue.**

The live-wiki test has two parts: the resolved directory exists, and
`detectMachine` says `workstation`. The machine probe takes
`NERDWAY_MACHINE` first, then known remote signals (Claude Code cloud,
Cursor cloud worker, Codespaces, a cloud agent box), then the host: chat
hosts are remote, a local Claude Code or Cursor session is a workstation.
The wiki directory is any directory; Obsidian is one optional way to keep
it, and nothing checks for it.

A remote host can still reach a workstation: the host adapter's
`workstation.exec` operation names how (a chat host's machine tool), and
the probe, the write and the verify then all run on that machine.

The resolved path is the wiki root itself. Skills read and write
`guides/`, `entities/projects/<slug>.md`, `index.md` and `log.md`
relative to it and no longer append a fixed subfolder.

## Considered Options

- **Trust the write on any machine with the directory** — rejected: that is
  the bug; a complete copy looks the same as the original.
- **A backend marker such as `.obsidian`** — rejected: Obsidian is optional,
  and a copy carries the marker too.
- **An opt-in marker file in the wiki** — rejected: it is copied together
  with the wiki, so it cannot tell a copy apart.
- **Writes through the `mcp` tier** — rejected for guides and Checkpoints:
  the agent is not on the workstation and the plugin cannot see whether a
  sync carried the write. `mcp` keeps reads.
- **A queue file in the user config directory** — rejected: not visible
  from another machine.
- **A tracker call in the SessionStart hook to find pending work** —
  rejected: hooks stay tracker-free and fast. The hook only prints a
  once-a-day line; the skill's drain asks the tracker.
- **Machine probe, verify line on the issue, queue comments, `Refs` at
  merge, drain on a workstation** — chosen.

## Consequences

- `resolveVault` returns `live`, `machine` and `reason`;
  `resolve-vault.ts --json` prints them and takes `--host`.
- `scripts/verify-vault-file.ts` and `scripts/pending-vault.ts` are new;
  `pr-body-state.ts` gains `--magic` and `--refs`.
- `PersonalGuide.outcome` drops `no-vault` and gains `pending` and a
  `verification` field; `EntityPageUpdate` gains `pending` and
  `verification`.
- New frozen rule `vault-write-live-and-verified`, enforced by the `close`
  gate. `session-summary-requires-checkpoint` drops the `tier=none` skip:
  an entry is verified, queued, or the project has no entity page.
- `issue-close` Step 0 reads the newest `## Personal guide` outcome:
  `Verified:` or `Not needed:` continue to Done, `Pending:` switches the
  description to `Refs <ID>`, merges and writes `in-review`, anything else
  stops before the merge.
- The SessionStart hook prints the drain line at most once per 24 hours per
  project, on a workstation with the wiki directory and a platform config.
- Breaking for a `wiki.path` or `NERDWAY_WIKI` that points at a vault root
  holding the wiki in a subfolder: append that subfolder to the value.
