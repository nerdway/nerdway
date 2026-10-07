---
name: tdd
description: >-
  Test-first implementation loop: red, verify red, green, refactor, check — one
  test and one minimal change per cycle, against the seams the plan names. Use
  when implementing an issue whose plan sets the test approach to TDD (invoked
  from issue-workflow and auto-issue-mode), or when the user asks to fix a bug
  or build a behaviour test-first ("napisz najpierw test", "TDD", "test
  first"). Not for a plan whose test approach is "no tests", and not for
  documentation-only changes.
---

# TDD

Tests are written before the code they cover, one behaviour at a time. The
point is not ritual: a test that has never been seen failing proves nothing,
and code written ahead of its test tends to shape the test around itself.

TDD is the plugin's **default** implementation mode, not a frozen rule. The
plan's **Test approach** decides it, and leaving it is always allowed, as long
as the reason is written down where the next reader looks.

## Entry: read the test approach

Take `testApproach` from the plan comment on the tracker:

| Plan says | What happens |
|---|---|
| `mode: TDD` | Run the loop below against the listed **seams**. |
| `mode: no tests` with a `reason` | This skill does not run. Implement plainly, run the stand-in check the reason names, and carry the reason and the check's result into the session summary's **Test approach**. |
| `mode: no tests` without a `reason` | Stop. Ask the user for the reason and the nearest runnable check that replaces a test, and add both to the plan in an `issue.comment` before writing code. |
| no `testApproach` (a plan older than the field) | The caller decides: `issue-workflow` asks the user in chat, `auto-issue-mode` assumes TDD and notes the assumption in the summary. |

The seams are settled in the plan, so the loop does not stop to agree them
again. A seam that turns out wrong mid-implementation is a plan change: name
it, and extend the plan with an `issue.comment`.

## The loop

Work through the acceptance criteria one at a time. Each criterion gets one or
more cycles; each cycle is exactly one test and the least code that makes it
pass.

1. **Red.** Write one test at a seam for the next behaviour the criterion
   needs. Before writing it, name the break it catches: the specific wrong
   change to the code that would turn it red. A test with no nameable break is
   not worth writing.
2. **Verify red.** Run it and read the failure. It must fail, and for the
   reason you named — a missing behaviour, not a typo, an import error or a
   broken fixture. A test that passes on first run either tests nothing new or
   tests the wrong thing; fix the test, never move on.
3. **Green.** Write the minimum production code that makes this test pass. No
   code for the next test, no options nobody asked for. Run it and see it
   pass.
4. **Refactor.** With the test green, clean up what this cycle introduced:
   names, duplication, structure. Run the tests again after each change. The
   refactor stays inside the loop and inside the cycle's own code; a wider
   clean-up is a separate change.
5. **Check.** Run the project's full test command and its validators, not
   just the new test. Everything is green before the cycle counts as done.
   Commit the cycle as one atomic commit.

Never weaken a test to get to green: no loosened assertion, no skipped case,
no expected value edited to match the output. If the test was wrong, say so
and fix it as its own red step.

## What makes a test worth keeping

- **Behaviour, not text.** Assert on what the code does through its public
  boundary, not on how it does it. For a repository of markdown instructions,
  grepping a skill's text proves nothing; an instruction is tested by the
  behaviour of the agent that follows it (evals).
- **Independent expected values.** Write the expected value as a literal you
  worked out separately. A test that computes its expectation with the code
  under test is **tautological** — a named defect, not a style choice: it
  passes whatever the code does.
- **Vertical, not horizontal.** One test, then its implementation, then the
  next test. Writing every test first locks in a design before any of it has
  been tried.
- **Mock only at system boundaries.** Fake the network, the clock, a paid
  API or a CLI that writes to a remote — not your own modules. A test that
  mocks the code it exercises checks the mock.

## Claims need evidence

The order is always: **the command, its output, then the claim.** "Tests
pass" is said only after running the test command in this session and reading
its result, quoted with the counts. A subagent's report is a claim too, not
evidence — re-run its check, or read the diff, before repeating what it said.

Before leaving implementation, `issue-workflow` step 6a requires the
**Criteria verification** table: every acceptance criterion with its check,
`pass` or `fail`, and the evidence. The check beats of this loop are where that
evidence comes from.

## Leaving TDD

Leaving is fine; leaving silently is not. When a cycle shows that a criterion
cannot sensibly be tested first — a pure prose change, a one-off migration, a
behaviour only observable on a live host — stop the loop for that criterion,
state the reason and the stand-in check in chat, and record it in the session
summary's **Test approach**. When it changes the mode for the rest of the
plan, extend the plan with an `issue.comment` carrying the new test approach.

## Related skills

- `nerd4rent:issue-workflow` — step 5 reads the plan's test approach and
  hands TDD work here; step 6a is the criteria verification table.
- `nerd4rent:auto-issue-mode` — runs this loop in its implementation stage
  without asking.
