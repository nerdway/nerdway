---
name: nerd-personal-docs
description: >-
  Write or update a human-readable guide for the user in the nerdbrain
  Obsidian vault (5-wiki/guides/{topic}.md) whenever finished work created or
  changed something the user will use, operate, fix or do by hand - a tool,
  service, machine, config or workflow. Mandatory step before an issue is
  closed: issue-workflow and auto-issue-mode run it on the session model
  before they call issue-close, which refuses to merge without it. Based on
  nerd-documentation-write, with one reversal: the reader is the user inside
  their own stack, so links to the related issues, PRs and commits are
  REQUIRED. The guide covers how to use it, the manual steps only the user can
  do (Kroki ręczne), troubleshooting, where secrets and config live, and the
  history with links. Use also when the user asks to document something for
  themselves ("udokumentuj dla mnie", "napisz przewodnik", "personal docs",
  "write a guide in nerdbrain"). Skipped with a note when the vault is absent.
---

# nerd-personal-docs: guides for the user in nerdbrain

Documentation for the user personally, kept in their nerdbrain Obsidian
vault. Agents tend to leave important knowledge only in issue and PR
descriptions, which the user does not read day to day. A guide is the one
place that says how a thing works, how to use it and what the user must do
by hand. Its style follows `nerd4rent:nerd-documentation-write`, with the
reversals listed below.

## When it runs

- **Before an issue is closed.** The callers of `nerd4rent:issue-close` run
  this skill first, on the session model, with the issue ID:
  `nerd4rent:issue-workflow` in its close-out and `nerd4rent:auto-issue-mode`
  at the start of its close-out stage. `issue-close` itself only checks the
  result (its Step 0) and stops the close-out when it is missing. Decide
  whether the work created or changed something the user uses, operates or
  may have to do by hand. If yes, write or update the guide. If no (a
  refactor, a test, a typo), say so in one line, post the not-needed comment
  of [Finishing](#finishing) step 3 and stop: that answer is the step's
  result, not a skip.
- **On request**, when the user asks to document something for themselves.

No guide for work that needs one means the issue is not finished.

## Vault and paths

- The vault is `~/obsidian/nerdbrain`. Check it before anything else:

  ```bash
  test -d ~/obsidian/nerdbrain/5-wiki
  ```

  A non-zero exit means this machine has no vault: write nothing, report
  "no nerdbrain vault on this machine, guide not written" and stop. The
  caller carries that line into its own report.
- Guides live in `5-wiki/guides/{topic}.md`, one file per tool, service or
  solution, named with a short kebab-case slug (`home-assistant.md`,
  `pangolin.md`). Search first with `nerd4rent:nerdbrain-search` and update
  the existing guide instead of creating a near-duplicate.
- The project's entity page (`5-wiki/entities/projects/{slug}.md`) links to
  its guides in a `## Dokumentacja` section; add the section when it is
  missing. Write the entity page through `nerd4rent:nerdbrain-wiki`.
- Vault access is filesystem only: `Read`, `Edit`, `Write` and `rg`, never
  an MCP server or the Local REST API.
- Before editing an existing file, copy it next to itself with a `.bak`
  suffix, and delete the copy once the write is verified. After every write,
  read the file back and check that Polish characters survived.

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
platform; when it did not, resolve it the way `nerd4rent:issue-close` does.

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

Kept from `nerd4rent:nerd-documentation-write`:

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

1. Link the guide on the project's entity page under `## Dokumentacja`.
2. Append one line to `5-wiki/log.md`:
   `## [YYYY-MM-DD] guide | {topic} ({short note})`.
3. Post a comment on the issue with the tracker adapter's `issue.comment`
   operation. Its first line is `## Personal guide`, followed by exactly one
   of these lines:

   ```
   Guide: 5-wiki/guides/{topic}.md
   Not needed: {one-line reason}
   ```

   Post it in the not-needed case too: it is the durable record
   `issue-close` reads when no guide mentions the issue. The guide's history
   entry carries the issue ID as the link text (`[DEMO-400](...)`) and the
   full issue URL, which is what `issue-close` searches the guides for.
   With no vault on the machine, post nothing.
4. Report the guide path, or the one-line reason no guide was needed, or
   the missing-vault line, to the caller.

## Checklist

- [ ] The guide exists or is updated in `5-wiki/guides/`.
- [ ] Every manual or future step for the user is in "Kroki ręczne".
- [ ] The issue and PR links are in "Historia i powiązania".
- [ ] The entity page links to the guide.
- [ ] The issue has a `## Personal guide` comment with the guide's path,
      or with the reason none was needed.
- [ ] A line is appended to `5-wiki/log.md`.

## Related skills

- `nerd4rent:issue-workflow`, `nerd4rent:auto-issue-mode` - run this skill
  before their close-out.
- `nerd4rent:issue-close` - checks the guide or the `## Personal guide`
  comment in its Step 0 and stops the close-out without them.
- `nerd4rent:nerd-documentation-write` - the style this skill adapts, for
  readers outside the user's stack.
- `nerd4rent:nerdbrain-search` - finds an existing guide before a new one is
  written.
- `nerd4rent:nerdbrain-wiki` - writes the entity page and the log.
