# The tracker carries the spec

Spec-driven frameworks keep the specification (WHAT and WHY) and the plan
(HOW) as files: claude-sdd hands a feature through a per-feature folder,
groundwork writes a `prd.md`, pspt derives a document set into the repository.
They do it because they have nothing else to hold that knowledge. This plugin
has: every piece of work already lives as an issue on a tracker, and the
workflow reads its phase, plan and history from there.

We make that the rule. **The tracker is the carrier of spec knowledge, and it
is what sets this framework apart:** the spec, the plan, the decisions taken
along the way and the session summaries sit in one issue thread, each dated,
attributed and next to the issue's status, readable without the repository and
without access to the code.

- **The issue description is the current spec.** One text, always current, in
  the full variant of the `IssueSpec` schema: Objective, Problem & context,
  Acceptance criteria, Scope, Constraints, Dependencies, Open questions. The
  acceptance criteria stay a checklist, so they are ticked on the tracker as
  before.
- **The comments are its history.** The plan is the `## Implementation plan`
  comment, as before. A spec change after work has started updates the
  description, after the user accepts the new text in chat, and adds a
  `## Spec change` comment saying what changed and why. The previous
  description is never lost: what it said is the old state the comment
  describes.
- **The repository holds code.** No spec file, no plan file, no handoff folder.

## How the spec connects to the plan and to verification

- Every acceptance criterion names how it is checked: a test or a command.
  A criterion that cannot name one is too vague and goes back to the spec.
- The plan lists the files it will change. Changing a file outside that list
  needs the user's consent in chat, and the file is then added in a comment
  that extends the plan.
- Before review, the implementation reports one row per criterion: the
  criterion, how it was checked, the result, the evidence. A `fail` blocks the
  move to review.

## Lifecycle

1. **Drafted** by `issue-writer`, or **refined** during planning: for a
   complex issue the planner compares the description with the full
   `IssueSpec` variant, settles missing or vague sections in a grilling
   session, and leaves a section nobody discussed empty rather than inventing
   it. The new description is shown in chat and written only after the user
   accepts it. A small, clear issue skips this step, with the same threshold
   `issue-writer` uses to pick the minimal template.
2. **Fixed** when the user moves the issue to `in-progress`: from then on the
   plan and the implementation are checked against it.
3. **Changed** only through the description update plus `## Spec change`
   comment above, each with the user's consent.
4. **Verified** criterion by criterion before review, and closed with the
   issue.

The ideas come from the sources compared in
`docs/research/2026-10-06-sdd-patterns.md`: the split of WHAT and WHY from HOW
from claude-sdd, capturing only what was said from groundwork, a check per
criterion and the stop on a file outside the plan from pspt.

## Considered Options

- **Spec and plan as files** (`docs/specs/<date>-<slug>.md` and
  `docs/plans/<date>-<slug>.md`, committed first on the issue branch) —
  rejected: they duplicate what the tracker already holds, and two copies of a
  spec drift apart. The research rejected a file-based handoff folder for the
  same reason. In client repositories other developers do not use the tracker
  and see the code and the PR/MR description; a spec file would be written for
  readers who do not need it.
- **The spec as a `## Specification` comment** — rejected: the description
  would then be a second, stale version of the same spec, and the description
  is what every tracker shows first and lets the user edit directly.
- **A separate `Spec` schema** — rejected: the full `IssueSpec` variant already
  carries every section the spec needs; a second schema would make two
  templates for one artifact.
- **A script that validates spec and plan files** — rejected together with the
  files. The shape of both comes from templates generated from the schemas, as
  for every other template.
- **A spec change by editing the description alone** — rejected: the tracker
  keeps no readable diff of a description on every platform, so the reason for
  the change would be lost. The `## Spec change` comment keeps it in the
  thread.

## Consequences

- The path uses only existing adapter operations: `issue.read`,
  `issue.update-description`, `issue.comment`, `issue.set-status`. It works on
  every tracker adapter and assumes nothing specific to Linear.
- `issue.update-description` replaces the whole description, so the agent
  extends sections and never drops what the user wrote, and shows the full new
  text before writing it. The write sits behind a chat-approval gate on
  `plan-draft` (`no-tracker-write-before-approval`).
- A `## Spec change` comment never starts with `Status:`, so it can never be
  read as a phase marker under the `comment` strategy (ADR-0006).
- The file list in the plan is enforced by a new frozen rule,
  `no-change-outside-plan`, carried by a chat-approval gate on `implement`.
- `IssueSpec`, `ImplementationPlan` and `ChangeSet` gain the criterion check,
  the affected files and the criteria verification table; the templates stay
  generated from the schemas.
- The research document's decision on where the spec and the plan live is
  amended to this one.
