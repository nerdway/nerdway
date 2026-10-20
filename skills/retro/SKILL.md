---
name: retro
disable-model-invocation: true
argument-hint: "[path to a session transcript]"
description: >-
  Turn the lessons of the current session into tracker issues: read the
  session, propose candidates by category (navigation, automated checks,
  coding standards, tool economy, no-ops, information access), each with its
  evidence and the change it asks for, apply nothing, and hand every candidate
  the user accepts to issue-writer as a draft. User-invoked only, as
  /nerd4rent:retro; writes nothing to the repo, memory files or the vault.
---

# Retro

A lesson that ends in a memory file, a chat line or nowhere is lost by the
next session, and on another machine at once. This plugin's rule is that a
lesson becomes an issue on the tracker: there it is planned, implemented and
closed like any other work, and the change it asks for lands in the place
that makes the mistake impossible (a validator, a skill step, an adapter
note), not in a note someone has to remember to read.

One pass: **read → propose → ask once → hand off**. The user starts it; it
never runs by itself after a session.

## Platform and adapters

Tracker commands live in an adapter file at the plugin root, never in this
skill. This skill reads through two operations of the tracker adapter,
`issue.list-open` (the open issues a candidate may duplicate) and
`issue.url` (their links):

```
${CLAUDE_PLUGIN_ROOT}/adapters/trackers/<tracker>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

Resolve the platform exactly as `nerd4rent:issue-writer` step 1 does (repo
`CLAUDE.md` `## Platform`, read from disk as
`${CLAUDE_PLUGIN_ROOT}/adapters/platform.md` describes → entity page
`platform:` / legacy `linear:` → `nerd4rent:determine-platform`). With no
tracker, still propose the candidates and say that the duplicate check was
skipped.

## Step 1 — Read the session

The session is the current conversation: the user's requests and
corrections, the commands run and their output, the files read, the
failures, and the work that went nowhere. When the argument names a
transcript file, read that file instead, and only read it.

Collect **lessons**: places where the session cost more than it had to, or
went wrong, and a change outside the session would have prevented it. Each
lesson carries its **evidence**: the command and its output, the user's
correction in their words, or the sequence of steps that went nowhere. A
lesson with no evidence in the session is dropped, however plausible it
sounds.

Not a lesson: a mistake already fixed in this session's commits with a test
that pins it; a one-off accident (a typo, a flaky network call that passed
on retry); a preference the user already wrote into their `CLAUDE.md` or
the repo's standards; anything about a person.

## Step 2 — Sort into categories

Put each lesson in one category. The category names what kind of change it
asks for:

| Category | The session showed | The change it asks for |
|---|---|---|
| **navigation** | searching for a file, a command or a convention that a pointer would have named | a pointer in a skill, an adapter, `CONTEXT.md` or the docs |
| **automated checks** | a mistake a test, validator or hook could have caught before review or the user did | a test, a validator rule or a hook |
| **coding standards** | the user correcting the same kind of code, naming or commit choice | an entry in the repo's standards (`CONTEXT.md` `## Standards`, `CONTRIBUTING.md`) or a review axis rule |
| **tool economy** | a costly path where a cheaper one existed: repeated reads, a wide search, a long output read in full, a wrong tool for the job | a recipe, an operation or a skill step that takes the cheap path |
| **no-ops** | steps that changed nothing: a command run twice, a check that cannot fail, a question whose answer was already in context | removing or merging the step |
| **information access** | information the session needed and could not reach, or reached by asking the user: a missing CLI field, an unauthenticated tool, an undocumented setting | an adapter operation, a CLI field, a bootstrap step or a doc |

A lesson that fits none of them is still proposed, under **other**, with
the reason.

## Step 3 — Check for duplicates

Run `issue.list-open` and compare each candidate with the open issues by
title and objective. A candidate an open issue already covers is not
proposed; it is listed apart with that issue's ID and link from `issue.url`,
so the user can add the new evidence to it by hand.

## Step 4 — Propose and ask once

Print every candidate, numbered, grouped by category, each as:

- a title in the form an issue would carry;
- the evidence from step 1, quoted or summarised with the command or the
  user's words;
- the change it asks for, and where (file, skill, adapter, validator);
- the recommendation: **accept** or **reject**, with one reason.

Then the duplicates from step 3, and the lessons dropped for lack of
evidence, one line each, so the user sees what was left out and why.

Ask one question in plain chat: which candidates become issues. The
recommended answer is the list of the ones marked accept. Applying a
candidate directly (editing a file, a skill or a memory file) is never
offered: the change it asks for is the work of the issue.

With no candidate at all, say so in one line, list the dropped lessons if
any, and end.

## Step 5 — Hand off to `issue-writer`

For each accepted candidate, in the order the user listed them, invoke
`nerd4rent:issue-writer` through the `Skill` tool with the candidate as the
request: its title, the evidence, the change and where it lands. Name the
session as the source in the request, so the draft's context section says
where the lesson came from. `issue-writer` resolves the container, shows the
draft and creates nothing without its own approval; a rejected draft ends
that candidate and moves on to the next.

End with the IDs and links `issue-writer` printed for the created issues,
and the candidates the user turned down.

## Boundaries

- **Nothing is applied.** No edit to the repo, the plugin, the user's
  `CLAUDE.md` or `AGENTS.md`, a memory file or the nerdbrain vault. The only
  output is issues, created by `issue-writer` after its approval.
- **The tracker is read-only here.** `issue.list-open` and `issue.url` are
  the only operations this skill runs itself.
- **The session is the only source.** No guess about earlier sessions,
  other machines or other users; a transcript is read only when the user
  names its path.
- **User-invoked only.** The skill does not start after a session, at the
  end of `issue-workflow` or `auto-issue-mode`, or on a hook.

## Related skills

- `nerd4rent:issue-writer` — drafts and creates every accepted candidate,
  behind its own approval.
- `nerd4rent:debug` — finds the cause of one failure; a lesson about why
  the failure was possible at all comes here.
- `nerd4rent:project-continue` — reports the project's open issues, the
  candidates this skill creates among them.
