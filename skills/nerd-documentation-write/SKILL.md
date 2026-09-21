---
name: nerd-documentation-write
description: Use when writing or revising a tutorial, README, or step-by-step guide meant to be read by people outside your own tooling stack (e.g. a client's engineers, open-source users) - conventions for what to strip out and how to phrase things so the doc reads clean for that audience.
---

# nerd-documentation-write

## Overview

Style rules for tutorial/README-style documentation aimed at readers outside
your own tooling stack. General-purpose - not scoped to any one project,
codebase, or language.

## Rules

### The doc is for a human reader, not a record of the writer's process

A doc exists so a reader can do a task correctly - it is not a place to think
out loud, narrate how a fix was found, log what surprised you along the way,
or preserve something an agent might find useful later. State the
destination-state fact the reader needs (the requirement, the current
behavior, the constraint) and stop - never the investigation trail that led
to it.

- Wrong: a step that's supposed to say "the tarball needs this jar" instead
  walks through how to verify the jar is missing, back up the archive,
  extract and repack it, fix a permissions gotcha hit along the way, and
  handle an idempotency edge case - a multi-paragraph repair log embedded in
  a placement instruction.
- Right: "Tarball Tomcata 8.5.20 (usługi ws-broker) musi zawierać
  `lib/xercesImpl-2.9.0.jar`. Bez niego filtr aplikacji wysypuje się przy
  starcie, a błąd trafia do `logs/localhost.<date>.log`, nie do logu
  aplikacji." One requirement, one visible symptom, nothing else.
- Wrong: a "gotchas" section headed "all confirmed by measurement on
  production, <date>" that quotes raw error messages, exception stack
  traces, and command exit codes from a specific debugging session.
- Right: the same gotchas as short factual statements, no date stamp, no
  quoted output, no "we found X, then discovered Y, so we changed Z"
  narration.

**Why:** the tell isn't length by itself - it's whose problem the content is
solving. A repair log solves the writer's problem (recording what they
discovered); a reader doesn't need that, they need the fact. Anything that
reads like a diary entry, defends against a future "why don't we just
simplify this" objection, or exists because it might help an agent
reconstruct context later does not belong in a document a human reads to get
something done.

**How to apply:** applies to every reader-facing doc (README, setup guide,
step-by-step tutorial, etc.) without exception - keep this rule in mind for
all of them even though only a couple of names are called out here. When a
section narrates investigation instead of stating a conclusion, compress it
to the fact plus its consequence. If the investigation itself has lasting
value, it belongs in a memory, a wiki page, or a commit message - not in a
document meant for a human to read.

### No internal issue-tracker references in reader-facing prose

Never mention issue-tracker IDs (Linear, Jira, GitHub issue numbers, MR/PR
numbers, etc.) in the body text of a doc aimed at external readers - section
headers, footnotes, inline "(see XXX-123)" pointers, all of it.

**Why:** the reader has no account in your tracker and the ID reads as noise
or a typo.

**How to apply:** keep issue tracking exactly as usual in your own commit
messages and tracker comments (plan/summary comments, PR descriptions,
`Fixes XXX-123` trailers) - this rule is scoped to the document's prose, not
your process around it. When a step's rationale comes from a ticket decision,
inline the reasoning in the doc's own words instead of pointing at the ticket
number.

### Every sentence opens with a real word, not a code token

Never start a sentence with an inline-code identifier (a variable name, a
filename, a config key) as its first word - open with an ordinary word first.

- Wrong: `` `tomcat_workers: [1]` - jeden worker wystarczy na jedną aplikację.``
- Right: "Workery Tomcata: `tomcat_workers: [1]` - jeden worker wystarczy na
  jedną aplikację."

**Why:** a sentence has to read as a sentence, not a code dump with a comment
tacked on.

### Regular hyphen, not an em dash

Use a plain hyphen (`-`) wherever you'd reach for an em dash (`—`).

**Why:** the em dash is a recognizable "agent tell" - a punctuation habit that
marks text as machine-written on sight.

### No emoji, ever

Plain text only. No emoji in headings, bullets, or body text.

### Don't overdo bold and italic

Never bold or italicize a single ordinary word just to add emphasis. Reserve
bold/italic for phrases that carry structural weight: naming the scenario
being walked through, marking something explicitly out of scope, or naming a
specific tool/file the reader needs to recognize later.

- Wrong: `` `site.yml`, **nie** `webservers.yml` ``
- Right: `` `site.yml`, nie `webservers.yml` ``
- Keep: `**poza zakresem tego przewodnika:**` (marks a scope boundary),
  `**`verify-smoke.yml`**` (names a tool referenced again later)

**How to apply:** before bolding/italicizing anything, ask whether it names a
thing (a scenario, a scope boundary, a tool/file) or just wants attention.
Only the former earns the markup.

### Headings are noun phrases, not narrated sentences

A heading or subtitle-like label is not a sentence - phrase it as a noun
phrase (a gerund or deverbal noun), even when the body prose around it is
written as first-person narration (e.g. Polish first-person plural:
"Dopisujemy hosta...", "Uruchamiamy playbook...").

- Wrong: `## 1. Dopisujemy hosta do inventory/production.yml`
- Right: `## 1. Dopisanie hosta do inventory/production.yml`
- Wrong: `## 4. Uruchamiamy playbook`
- Right: `## 4. Uruchomienie playbooka`

**How to apply:** applies to every heading and to any bold label that
functions as a lead-in title for what follows. Only the heading/title itself
changes - the prose underneath keeps its own voice. An infinitive-style title
("Jak to uruchomić od zera") is not a narrated sentence, so it's out of
scope - only convert headings that are actually conjugated "we do X"
sentences.

### No loanword jargon the reader wouldn't use themselves

Don't reach for an internal-tooling loanword in prose just because that's
what the underlying file/tool is called - phrase it in the document's own
words instead.

- Wrong: "Smoke test (asercje: usługi, porty...)" / "smoke nie może się
  rozjechać z tym, co faktycznie stoi"
- Right: "Sprawdzenie wdrożenia (asercje: usługi, porty...)" / "sprawdzenie
  nie może się rozjechać z tym, co faktycznie stoi"

**How to apply:** the word is banned only in prose (headings, bold lead-in
labels, running sentences) - the underlying file/module/variable name stays
exactly as it is (e.g. `verify-smoke.yml`), since renaming those is a code
change, not a doc-style one. Any time a project's internal jargon term has a
plain-language equivalent, prefer the plain one in reader-facing prose and
reserve the jargon for identifiers.

### One runnable command per fenced code block, described in prose above it

Never label steps or alternatives with `#`-comments inside a fenced code
block, and never leave a command meant to actually be run as an inline code
span in running prose. Give each standalone command its own fenced block,
with its description as an ordinary sentence immediately above it.

- Wrong:
  ```bash
  # 1. tworzymy lokalny sandbox Pythona w katalogu .venv
  python3 -m venv .venv

  # 2. aktywujemy go (patrz niżej, co to znaczy)
  source .venv/bin/activate
  ```
- Right:
  Tworzymy lokalny sandbox Pythona w katalogu `.venv`:
  ```bash
  python3 -m venv .venv
  ```
  Aktywujemy go (patrz niżej, co to znaczy):
  ```bash
  source .venv/bin/activate
  ```
- Wrong: `` Sprawdzamy, że działa: `ansible --version`. ``
- Right:
  Sprawdzamy, że działa:
  ```bash
  ansible --version
  ```

**Why:** many editors (e.g. IntelliJ's Markdown preview) can run a fenced
code block directly - but only a proper fenced block is runnable that way,
and a block bundling multiple `#`-commented steps defeats running just one of
them on its own.

**How to apply:** applies to every command a reader would actually type or
run - not to commands merely mentioned for illustration inside a sentence
(those stay inline). When two commands are alternatives (e.g. "create" vs
"edit" a file) rather than sequential steps, still give each its own block,
with the prose above naming which case it's for. A warning or caveat that was
living as a `#`-comment inside the block moves to prose or a blockquote above
the block, never into the code itself.

**Default is one command per block, full stop - joining two commands (with a
newline in the same fence, or with `&&`) needs a positive reason, not just
brevity.** Even a plain sequence with no comments (`mkdir ...` then `cp ...`)
should be two blocks: run separately, a failure is attributed to the exact
command that caused it. Run joined, a failed first command can be masked, and
the reader has to stop and work out which command actually broke instead of
seeing it immediately.

The one legitimate reason to join two commands is when splitting them would
let the reader silently get a *wrong* result rather than a loud failure - not
because the two commands are merely related. Activating a virtual environment
before another command is the case that actually qualifies, but only in
contexts where the two aren't guaranteed to run in one continuous shell
session (e.g. a copy-paste command meant to be pasted into any fresh
terminal) - if that command runs alone without the environment active, it may
silently fall through to a system-wide tool instead of erroring, which is
exactly the failure mode this rule exists to prevent. Within a walkthrough
where the reader is expected to run blocks in order in one session, split
even the activation step into its own block - only collapse it into a `&&`
chain for the specific "self-sufficient one-liner meant to be pasted
anywhere" case.

## Status

Living document - add a rule here whenever a real review surfaces a new,
generalizable convention. Keep entries as rules to follow, not a changelog of
how they were discovered.
