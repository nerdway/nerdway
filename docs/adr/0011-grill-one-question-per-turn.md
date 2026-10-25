# Grill asks one question per turn, as a menu

`nerd4rent:grill` took from Matt Pocock's grilling the idea of asking every
question that can be answered now in one batch, numbered, each with a
recommended answer on the same line, so a plain "tak" accepted the whole
batch. It did not take the shape of his questions (a title, a body with the
options, the recommendation on its own line). In practice everything
collapsed into "recommended: yes/no", options appeared only for decisions
that were hard to reverse, and the batch was wrapped in scaffolding written
for the agent: a findings preamble, a footer explaining what "tak" accepts,
and a full `## Grill state` block in chat after every batch. The skill's own
vocabulary leaked into the messages the user read. The user stopped reading
the batches, and a question that depended on an earlier answer could not be
asked in the same turn anyway. The grilling session of 2026-10-25 (DEMO-460)
settled seven decisions about the interaction; this record keeps the model
they add up to.

**The grill asks one question per turn, each as a menu of two or three
options with one pro/con line each and the recommended option first; in
Claude Code the menu goes through `AskUserQuestion`, everywhere else it is
the same content as a numbered list in chat where "tak", "yes" or "1" picks
the recommendation; the state is written after every answer, to a comment on
the issue when one exists, so chat gets one summary line; and the text the
user reads speaks about their topic, never about the skill's mechanics.**

The model takes the best of two sources, credited here in prose only
(ADR-0009): the brainstorming skill of superpowers (one question per message,
multiple choice, two or three approaches with trade-offs, the recommendation
first) and Pocock's grilling (facts are checked, never asked; every question
carries a recommendation; the session ends only on shared understanding).

A yes/no question is not allowed: it is rephrased as a choice between
concrete options. The next question is picked only after the answer, so it
may depend on it. The end of the session is a menu too: act on it
(recommended), change something, add a branch.

## Considered Options

- **Pocock's batch in a better format** (every independent question at
  once, each with a title, options and the recommendation on its own line)
  — rejected: it fixes the shape of one question but keeps the wall of text
  the user stopped reading, and a dependent question still waits for the
  next batch.
- **A hybrid: several questions in one `AskUserQuestion` call** (the tool
  takes up to four) — rejected: it only exists in Claude Code, so Cursor
  would get a different interaction than the one the evals check, and the
  questions in one call still cannot depend on each other.
- **Only the host's native menu** — rejected: ADR-0007 requires the skill to
  work in Cursor and in any Agent Skills client; a native menu without a
  fallback leaves those hosts without a way to ask, and the eval sessions
  (Read, Glob, Grep and Skill only) could not test the interaction at all.
- **One question per turn, host menu with a numbered fallback, state after
  every answer** — chosen.

## Cursor's native question tool

Checked on 2026-10-25: Cursor has a native tool for this. Version 2.4
(changelog of 2026-01-22, `cursor.com/changelog/2-4`) made the Q&A tool that
agents used in Plan and Debug mode available in any conversation, and says a
custom skill can use it when told to "use the ask question tool". Forum
reports from 2026 show it is gated per model (some models do not get it),
skipped in headless `cursor-agent -p` runs, and not offered over ACP or the
SDK. The skill does not use it: the numbered list works on every host, and
wiring the tool in is a separate change, not part of this decision.

## Consequences

- `skills/grill/SKILL.md` describes both renderings, the one-question shape,
  the state after every answer and a voice section: the internal phrases
  (frontier, round, fold in, resolved branch, carrier, state block,
  recommendation accepted) never appear in text addressed to the user, each
  with a before/after example. `scripts/grill-skill.test.ts` pins the stable
  tokens of that text.
- The `## Grill state` block loses its batch number and keeps one
  `### Next question` with its options, so a resumed session asks it
  verbatim. A block written by the earlier version of the skill is read by
  meaning: its list of next questions becomes a queue asked one at a time.
- The grill evals check the numbered fallback, since an eval session has no
  `AskUserQuestion`; a click in the native menu is checked by hand in an
  ordinary Claude Code session, not by a criterion.
- A session has more turns than before, each shorter. A tracker issue gets
  one state comment per answer instead of one per batch; the newest comment
  is still the state.
- ADR-0009's note that the grill "asks in rounds" is amended to point here.
