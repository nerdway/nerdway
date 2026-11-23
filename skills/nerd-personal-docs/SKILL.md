---
name: nerd-personal-docs
description: >-
  Write or update a human-readable guide for the user in the wiki directory
  (guides/{topic}.md) whenever finished work created or changed something the
  user will use, operate, fix or do by hand - a tool, service, machine, config
  or workflow. Mandatory before an issue is closed: issue-workflow and
  auto-issue-mode run it before issue-close, which refuses to merge without
  it. Based on nerd-documentation-write, reversed: the reader is the user, so
  links to the issues, PRs and commits are REQUIRED. Covers usage, the manual
  steps only the user can do (Kroki ręczne), troubleshooting, where secrets
  and config live, and the history. Writes only to the live wiki on a user
  workstation and verifies the file there; otherwise queues the text on the
  issue, and its drain mode writes the queue later. Use also when the user
  asks ("udokumentuj dla mnie", "napisz przewodnik", "personal docs", "write
  a guide in nerdbrain", "drain pending guides").
---

# nerd-personal-docs: guides for the user in nerdbrain

Documentation for the user personally, kept in their wiki directory (the
path `resolveVault` returns: a plain folder, or a folder inside an Obsidian
vault; Obsidian is optional). Agents tend to leave important knowledge only in issue and PR
descriptions, which the user does not read day to day. A guide is the one
place that says how a thing works, how to use it and what the user must do
by hand. Its style follows `nerdway:nerd-documentation-write`, with the
reversals listed below.

## When it runs

- **Before an issue is closed.** The callers of `nerdway:issue-close` run
  this skill first, on the session model, with the issue ID:
  `nerdway:issue-workflow` in its close-out and `nerdway:auto-issue-mode`
  at the start of its close-out stage. `issue-close` itself only checks the
  result (its Step 0) and stops the close-out when it is missing. Decide
  whether the work created or changed something the user uses, operates or
  may have to do by hand. If yes, write or update the guide. If no (a
  refactor, a test, a typo), say so in one line, post the not-needed comment
  of [Finishing](#finishing) step 3 and stop: that answer is the step's
  result, not a skip.
- **On request**, when the user asks to document something for themselves.
- **Drain**, as `/nerdway:nerd-personal-docs drain` or when the SessionStart
  line asks for it: see [Drain](#drain).

No guide for work that needs one means the issue is not finished.

## Live wiki and paths

A guide is written only to the **live wiki**: the wiki directory
`resolveVault` returns, on a user workstation. A copy of that directory on a
remote agent machine (a cloud session, a chat bot's box, a sandbox) is never
written, even when it is complete, because nothing guarantees it ever reaches
the user (ADR-0025).

- Detect the host first (`host.detect` of `${CLAUDE_PLUGIN_ROOT}/adapters/hosts/`),
  then resolve and probe the wiki once:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-vault.ts" --json --host <host> "$(git rev-parse --show-toplevel)"
  ```

  If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
  directories up from this skill's base directory. `path` is `<WIKI>`, the
  wiki directory itself; every path below is relative to it.
- `live: true`: write here, then verify (below).
- `live: false`: read the host adapter's `workstation.exec`. When it has a
  recipe and a user workstation is reachable, run the probe there (it must
  print `live: true`), then the write and the verify, all on that machine.
  When the recipe is `—`, no workstation is reachable or the probe there is
  not live, queue the guide on the issue (below). Never write into a
  directory whose probe says `live: false`.
- Guides live in `<WIKI>/guides/{topic}.md`, one file per tool, service or
  solution, named with a short kebab-case slug (`home-assistant.md`,
  `pangolin.md`). Search first with `nerdway:nerdbrain-search` and update
  the existing guide instead of creating a near-duplicate. Reads may use any
  tier, including `mcp`; the write may not.
- The project's entity page (`<WIKI>/entities/projects/{slug}.md`) links to
  its guides in a `## Dokumentacja` section; add the section when it is
  missing. Write the entity page through `nerdway:nerdbrain-wiki`.
- Before editing an existing file, copy it next to itself with a `.bak`
  suffix, and delete the copy once the write is verified. After every write,
  read the file back and check that Polish characters survived.

### Verify

Right after the write, on the same machine:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/verify-vault-file.ts" <WIKI> guides/{topic}.md --contains <issue URL>
```

Exit 0 prints one line, `verified guides/{topic}.md <bytes> bytes
sha256:<hash> on <machine> <date>`; that line is the evidence for the
`Verified:` line of [Finishing](#finishing). Any other exit means the guide
does not count: exit 1 (missing, empty, no issue URL) is fixed and verified
once more; exit 3 (not the live wiki) means queue instead. "Written" without
this line is never reported.

### Queue

With no live wiki reachable, post the full guide text on the issue so any
workstation session can write it later. Write the text to a file, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pending-vault.ts" format-guide --path guides/{topic}.md --mode create --entity <slug> --out <dir> < <guide file>
```

`--mode update` when an existing guide was found (the text is then the whole
updated guide), `--entity none` when the project has no entity page. The
command prints one file per comment (`## Pending guide`, split into numbered
parts above the tracker's comment limit); post each with the tracker
adapter's `issue.comment`, in order. Then post the `Pending:` outcome of
[Finishing](#finishing) step 3. The entity page link and the log line wait
for the drain.

## Links to the history

Collect the links before writing; the guide's history section needs them:

- the issue link from the tracker adapter's `issue.url` operation
  (`${CLAUDE_PLUGIN_ROOT}/adapters/trackers/{tracker}.md`);
- the PR or MR link: the tracker adapter's `issue.read` shows the PR or MR
  linked to the issue, and the VCS adapter's `## URL` section
  (`${CLAUDE_PLUGIN_ROOT}/adapters/vcs/{vcs}.md`) says how the host forms
  it;
- commit links when a single commit matters on its own.

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory. The caller passes the
platform; when it did not, resolve it the way `nerdway:issue-close` does.

## Structure of a guide

Write in natural Polish, as one person to another. Use these sections in
this order and skip only the ones that are truly empty:

1. **Czym to jest i gdzie stoi**: one short paragraph on what it is, where
   it runs (host, VM or container ID, IP, DNS name) and which agent or bot
   owns it.
2. **Jak używać**: the everyday tasks, with the real addresses, commands and
   UI paths.
3. **Kroki ręczne**: every step only the user can do, now or one day:
   logins, approvals, UI clicks, physical actions, secrets to rotate,
   decisions waiting on them. Mark each one as `jednorazowo`, `cyklicznie`
   or `awaryjnie`. This section is the reason the skill exists: a manual
   step never lives only in an issue.
4. **Gdy coś nie działa**: known symptoms and their fixes, plus how to roll
   back.
5. **Gdzie są sekrety i konfiguracja**: password-manager item names, repo
   paths, config files. Never a secret value.
6. **Historia i powiązania**: the issues, PRs and commits that created or
   changed it, newest first, each a full working link with one line on what
   it changed, e.g. `[DEMO-400](https://linear.app/...)` or
   `[repo#14](https://github.com/...)`.

When updating a guide, rewrite the sections the work changed so they state
the current behaviour, and prepend the new history entries.

## Style rules

Kept from `nerdway:nerd-documentation-write`:

- **Facts, not a repair log.** State the requirement or the current
  behaviour and its consequence; the investigation trail stays in the issue
  the guide links to.
- **Sentences open with a real word**, not an inline-code token.
- **A plain hyphen (-), never an em dash.** No emoji.
- **Bold and italic only for structural weight**, never for emphasis on an
  ordinary word.
- **Headings are noun phrases** ("Dodanie gniazdka", not "Dodajemy
  gniazdko").
- **No loanword jargon in prose** when a plain Polish word exists;
  identifiers stay as they are.
- **One runnable command per fenced code block**, with its description in a
  sentence above it and no `#` step comments inside. Join commands only when
  splitting them could silently give a wrong result.

Reversed, because the reader is the user inside their own stack:

- **Issue, PR and commit references are required**, inline ("zmienione w
  [DEMO-401](...)") and in the history section, always as working links,
  never as bare IDs.
- **Internal names are fine**: bot names, hostnames, VM IDs,
  password-manager item names.

## Finishing

1. Link the guide on the project's entity page under `## Dokumentacja`
   (live wiki only; a queued guide is linked by the drain).
2. Append one line to `<WIKI>/log.md`:
   `## [YYYY-MM-DD] guide | {topic} ({short note})` (live wiki only).
3. Post a comment on the issue with the tracker adapter's `issue.comment`
   operation. Its first line is `## Personal guide`, followed by exactly one
   of these outcomes, printed by
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/pending-vault.ts" format-outcome verified|pending|not-needed ...`:

   ```
   Guide: guides/{topic}.md
   Verified: verified guides/{topic}.md <bytes> bytes sha256:<hash> on <machine> <date>
   ```

   ```
   Pending: guides/{topic}.md
   ```

   ```
   Not needed: {one-line reason}
   ```

   Post it in the not-needed case too: it is the durable record
   `issue-close` reads. `Guide:` without the `Verified:` line from the verify
   command is not an outcome. The guide's history entry carries the issue ID
   as the link text (`[DEMO-400](...)`) and the full issue URL, which is what
   the verify command checks.
4. Report to the caller: the guide path with the verify line, or "guide
   pending on `<ID>`: no live wiki reachable, queued on the issue", or the
   one-line reason no guide was needed.

## Drain

Runs on a workstation, from `/nerdway:nerd-personal-docs drain` or the
SessionStart line "drain pending guides". It needs the platform config and
the live wiki; when the probe of [Live wiki and paths](#live-wiki-and-paths)
says `live: false`, report "not the live wiki here, nothing drained" and stop.

1. List the active issues with the tracker adapter's `issue.list-active`.
2. For each issue, read it with `issue.read`, take the comment bodies oldest
   first as a JSON array of strings (GitHub's `issue.read` JSON may be passed
   as it is) and pipe them to
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/pending-vault.ts" open`. It prints the
   items still waiting: a guide whose newest `## Personal guide` outcome is
   `Pending:`, and every `## Pending checkpoint` no later verified
   `## Checkpoint` comment answers. Guides are drained on In Review issues
   only; checkpoints on every active issue (Todo, In Progress, In Review),
   because a Checkpoints entry is queued after any working session.
3. A pending guide: write it to `<WIKI>/<path>` (`create`: a new file, or an
   update of the guide that appeared since; `update`: replace the guide with
   the queued text), link it under `## Dokumentacja` of the entity page the
   item names, append the log line, run [Verify](#verify), and post the
   `Verified:` outcome of [Finishing](#finishing) step 3. When the issue's
   PR/MR is already merged (the close-out left the issue In Review only for
   the guide), write phase `done` with the tracker adapter's
   `issue.set-status`; otherwise leave the phase as it is.
4. A pending checkpoint: prepend the entry to `## Checkpoints` of
   `<WIKI>/<page>` through `nerdway:nerdbrain-wiki` (`page.prepend-capped`,
   cap 10, `updated:` bumped), verify with `--contains` the entry's first 60
   characters, and post the answer printed by
   `pending-vault.ts format-checkpoint-outcome --page <page> --verification <verify line>`.
5. Report one line per drained item and per item that failed, with its
   reason. A failed item stays queued; the queue comments stay as history.

## Checklist

- [ ] The guide was written to the live wiki and verified there, or it is
      queued on the issue as `## Pending guide`.
- [ ] Every manual or future step for the user is in "Kroki ręczne".
- [ ] The issue and PR links are in "Historia i powiązania".
- [ ] The entity page links to the guide (live wiki only).
- [ ] The issue has a `## Personal guide` comment with `Guide:` plus
      `Verified:`, `Pending:`, or `Not needed:`.
- [ ] A line is appended to `<WIKI>/log.md` (live wiki only).

## Related skills

- `nerdway:issue-workflow`, `nerdway:auto-issue-mode` - run this skill
  before their close-out.
- `nerdway:issue-close` - reads the `## Personal guide` comment in its
  Step 0: `Verified:` or `Not needed:` continue, `Pending:` merges with
  `Refs <ID>` and leaves the issue In Review, anything else stops.
- `nerdway:nerd-documentation-write` - the style this skill adapts, for
  readers outside the user's stack.
- `nerdway:nerdbrain-search` - finds an existing guide before a new one is
  written.
- `nerdway:nerdbrain-wiki` - writes the entity page and the log.
