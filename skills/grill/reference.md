# Grill reference

Read this file from `skills/grill/SKILL.md` when you need the voice table,
the caller contract, or the full record shapes. Runtime rules stay in
`SKILL.md`.

## Voice: developer to developer

Text addressed to the user talks about their topic, in plain words, the way a
colleague would. The phrases below are this skill's internal vocabulary: they
name its mechanics and never appear in a message to the user, neither in a
question nor in the summary line, the outcome or the confirmation menu.

| Internal phrase | Before | After |
|---|---|---|
| frontier | "The next frontier has three questions." | "Two things left to decide. First: where does the button go?" |
| round / runda | "Round 2:" / "Runda 2:" | no counter at all, just the next question |
| fold in | "I folded your answer in." | "OK, export from the report header." |
| resolved branch | "Resolved branches: 2 of 3." | "Settled so far: button in the header, current rows only." |
| carrier | "The carrier is chat." | "The notes stay in this chat; another machine will not see them." |
| state block / blok stanu | "Writing the state block." / "Paste a `## Grill state` block." / "Zapisuję blok stanu." | "saved: button in the report header" / "Paste the notes from that chat." / "zapisane: przycisk w nagłówku raportu" |
| recommendation accepted | "Q1: recommendation accepted." | "Button: report header." |
| question number (`Q3`) | "Q4 → current rows only." | "Export: only the rows the report shows now." |
| acceptance-criterion position ("criterion 6", "AC #2") | "Criterion 6 → stays." | "An empty report still refuses to export, as the issue asks." |

## Callers

| Caller | Passes | Does with the outcome |
|---|---|---|
| `nerd4rent:issue-writer` step 2 | `issue: none`, topic = the user's request | drafts the issue body from the decisions; a large size becomes the split proposal of its step 3, of the kind the outcome named — never a draft whose Out of scope only defers this topic's implementation to another issue |
| `nerd4rent:issue-writer` step 6 | `issue: <ID>`, topic = the created issue's body | updates the description after showing the diff; proposes sub-issues only after approval, and only for a large result split or stages in time of distinct shippable deliverables; never a new issue whose only purpose is implementing this grill; then ends at step 7 on `<ID>` |
| `nerd4rent:issue-workflow` step 1a | `issue: <ID>`, topic = the issue description | refines the spec (its step 0c) and drafts the plan on `<ID>`; posts neither before the confirmed outcome; never offers a new issue for the implementation of those decisions |
| `nerd4rent:new-project-workflow` step 5 | `issue: none`, topic = the scaffolded README and the project idea | hands the decisions to the first issue of the project |

After `Confirmed shared understanding: yes` with `issue: <ID>`, every
caller above returns to refining the spec, drafting the plan, or
implementing **on that same ID**. No menu, widget or suggestion to
create a follow-up whose only job is "implement this grill" / "załóż
follow-up na implementację". Out of scope may name a *different topic*
(another bot, another runner, an unrelated feature) — never "do the
implementation of this grill elsewhere" and never the lines "Out of
scope: implementacja w osobnym issue" or "implementation in a separate
issue".

## Related skills

- `nerd4rent:issue-writer` — invokes this skill for the interview before the
  issue exists and for the optional session after it was created.
- `nerd4rent:issue-workflow` — invokes this skill before posting a plan for
  an ambiguous issue.
- `nerd4rent:new-project-workflow` — offers this skill as the first item of
  its spec-skill menu.
- `nerd4rent:nerdbrain-wiki` — writes the decisions this skill tags as
  entity-page decisions.

## Docs-discipline tags

Each settled decision in the outcome carries one tag:

- **ADR** when the decision is hard to reverse, surprising without its
  context, and carries a real trade-off — all three — written in the repo's
  `docs/adr/` following its existing pattern.
- **glossary term** when the session sharpened a word the project uses — an
  entry in the repo's `CONTEXT.md`. The caller turns it into an acceptance
  criterion of the issue, "`CONTEXT.md ## Language` has the term `<Term>` —
  check: `node scripts/validate-context-terms.ts`", and lists `CONTEXT.md`
  among the plan's affected files; the entry itself is written during
  implementation.
- **entity-page decision** when it is a project-level decision — the
  `## Decisions` write trigger of the nerdbrain entity page, through
  `nerd4rent:nerdbrain-wiki`.
- **none** otherwise; most decisions carry no tag.

## Numbered-list fallback

When no native ask tool is in the session:

```
**<header>**
<question>

1. <option> (recommended): <why this one>
2. <option>: <what speaks for it>; <what it costs>
```

## Full `## Grill state` block

The complete record. Print it in chat only when `SKILL.md` section 4 says to
(on request, as a paste-resume source, or as the last record of the session).
With `issue: <ID>`, post it through `issue.comment` after every answer.

```
## Grill state

Topic: <one line>
Size: medium
Confirmed shared understanding: no

### Resolved
- <question> — <answer> (recommended)
- <question> — <answer> (own answer)

### Facts checked
- <what> — <where> — <result>

### Open
- <decision not asked yet>
- fact: <what> — check on <machine>

### Next question
**<header>** <question>
1. <option> (recommended): <why this one>
2. <option>: <what speaks for it>; <what it costs>
```

## Compact chat note (`issue: none`)

After each answer, chat gets the summary line plus this shape, not the full
block:

```
saved: <what was just decided>

Resolved:
- <question> — <answer> (recommended)
Next: <header>
```

## Living Grill decisions checklist

With `issue: <ID>`, upsert one living comment (or a description section) after
every answer. The user may flip or rewrite a line on the tracker; on resume
those edits are the source of truth.

```
## Grill decisions

- [x] Who the file is for — managers (recommended)
- [x] Archived rows — exclude (recommended)
- [ ] Column headers — deferred
```
