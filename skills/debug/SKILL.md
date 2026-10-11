---
name: debug
description: >-
  Find the cause of a failure before touching the fix: start from one command
  that is already red on this bug, rank up to three falsifiable hypotheses,
  settle them with the smallest evidence, write the regression test through
  tdd at the right seam, fix only what the evidence justifies, and stop after
  three failed fixes. Invoked by tdd when a red step is red for a reason other
  than the named one or a check turns red, by auto-issue-mode before its
  red-tests stop, and by issue-workflow when planning an issue labelled Bug;
  use directly when the user asks for the cause ("debug this", "find the root
  cause", "why does this fail", "zdebuguj", "znajdź przyczynę", "dlaczego to
  pada"). Not for a TDD red step that fails for the reason it was written for,
  not for a question about how code works, not for a feature.
---

# Debug

A failure nobody has explained yet is not a task to fix; it is a task to
understand. The common move, trying the first plausible change and running the
tests again, costs little per attempt and a lot in total: the fix that happens
to go green may be a coincidence, the real cause survives, and the regression
test, if one is written at all, pins the coincidence. This skill owns the
stretch between "it is red and I do not know why" and "I know why, and a test
proves it".

The method is the one the debugging literature agrees on: reproduce first, a
ranked hypothesis before a change, evidence before a fix, a regression test
before the fix, a hard stop after repeated failure. Four points are our own,
because they came from our own failures: the feedback loop is the entry, not a
later phase; up to three hypotheses are ranked together instead of one at a
time; a forced mutation has to be proved to have landed before its red test is
trusted; and the record goes where this plugin already keeps records, the
issue and the commit, never a new kind of comment.

## Arguments

The caller passes one line of prose, read before anything else:

```
issue: DEMO-123          (or: issue: none)
```

`issue: <ID>` means the failure belongs to work tracked on an issue: the
record (section 7) goes into that issue's session summary and into the commit
of the fix. `issue: none` means there is no issue: the record goes to the chat
and into the commit. The rules are the same either way. When the user invoked
this skill directly and gave no line, assume `issue: none` and say so.

## 1. Feedback loop

Nothing starts without one command, already run in this session, that is red
on this bug. The command is the whole truth about the failure for the rest of
the session: not a description of it, not a screenshot, not a report from a
subagent.

- Take the failing test or validator as it is. When the failure is reported
  from somewhere else (a user, a CI log, a subagent), reproduce it here first
  and show the command and its output.
- Minimise it: one test file, one case, one input, as far as the failure
  survives the cut. A loop that runs in seconds is run after every step; one
  that runs in minutes is run only when a hypothesis has been settled.
- **Redact secrets before showing a command or its output.** Environment
  values, tokens, passwords and URLs that carry credentials are replaced with
  a placeholder such as `<redacted>` in everything printed to chat, written
  to the issue or put into a commit. The redaction happens before the text is
  shown, not after.

When no red command can be produced, stop here and report that: there is no
failure to debug yet, only a suspicion.

## 2. Hypotheses

Write down **up to three** hypotheses about the cause, ranked by how likely
each is, each phrased so that one observation could prove it wrong. Show the
list to the user without waiting for an answer and move on; the ranking is
the plan for section 3, and the user can reorder it at any time.

A hypothesis names a mechanism ("the glob is unquoted, so the shell expands
it before Node sees it"), not a location ("something in the runner"). One
that cannot be falsified by any observation is not a hypothesis; drop it.
Write the list even when the cause looks obvious after reading the code: the
obvious cause is the first hypothesis, not a reason to skip the step, and the
list is what the user sees when the first fix does not hold.

## 3. Evidence

Work down the ranking. For each hypothesis, make the **smallest change that
settles it**: a logged value, a hard-coded input, a reverted line, a second
command that isolates one factor. Read the result, then say whether the
hypothesis stands or falls, and why.

- Mark every debugging log with one tag (for example `[debug DEMO-123]`) and
  remove every tagged line before the fix is committed; `rg` for the tag is
  the check.
- **Prove the mutation landed.** When the evidence is a forced change to the
  code (a value hard-coded, a branch disabled), show that the change is
  actually in the executed code before trusting the red or green it produced:
  a `git diff` of the mutated lines, a tagged log that prints from inside
  them, or the stack trace that passes through them. A red test after a
  mutation that never ran proves nothing.
- A hypothesis that falls is crossed off with its evidence; the next one is
  taken. When all three fall, go back to section 2 with what was learned.

## 4. Regression test

With the cause confirmed, write the test that catches it, **before the fix**,
through `nerd4rent:tdd`: one test at the seam the bug lives on, red for the
confirmed cause and for nothing else. The seam is the one the plan names when
an issue exists; without a plan, it is the nearest public boundary that
exercises the mechanism, never the private line that happens to be wrong.

A regression test that passes before the fix is applied is not a regression
test. Fix the test, not the expectation.

## 5. Fix

Make the smallest change the evidence justifies, and only that. The red
regression test goes green, the full test command and the validators are run
and read, and the tagged logs are gone. The confirmed hypothesis goes into the
body of the commit, in the repository's commit language, so the next reader
finds the cause in `git log` without the issue.

## 6. Stop rule

Count the fixes attempted on this failure. After the **third** fix that did
not make the loop green, stop changing code. Report the command, the three
hypotheses with their evidence, and the three fixes with their results, and
ask the user which direction to take: a hypothesis to reopen, a seam to
question, or a spec change. Under `auto-issue-mode` this is its existing stop
condition for red tests; the report replaces the question.

The stop is not a failure of the method. Three fixes that did not hold mean
the hypotheses were wrong or the failure has more than one cause, and either
way the next step is a decision, not a fourth guess.

## 7. Record

The record is short, and it goes where this plugin already keeps records:

- **Session summary**, validation section, when an issue exists: the red
  command, the confirmed hypothesis, the evidence that confirmed it, the
  regression test. No new comment type: a `## Spec change` is posted only when
  the bug turned out to be in the spec.
- **Commit** of the fix, always: the confirmed hypothesis in the body.
- **Chat**, when there is no issue: the same four items as the summary.

## Callers

| Caller | Passes | When |
|---|---|---|
| `nerd4rent:tdd` | `issue: <ID>` or `none` | "Verify red" is red for a reason other than the one the test was written for, or "Check" turns the suite red |
| `nerd4rent:auto-issue-mode` stage 3 | `issue: <ID>` | tests are red after implementation, before the run declares its red-tests stop |
| `nerd4rent:issue-workflow` step 1 | `issue: <ID>` | planning an issue labelled Bug: the feedback loop is the first implementation step and the regression test the first red of `tdd` |
| the user | `issue: <ID>` or none | a direct request for the cause of a failure |

## Related skills

- `nerd4rent:tdd` — writes the regression test of section 4 and runs the
  check of section 5; hands a red step with an unexplained cause here.
- `nerd4rent:auto-issue-mode` — calls this loop before stopping on red tests.
- `nerd4rent:issue-workflow` — plans an issue labelled Bug around this loop
  and carries the record in the session summary.
