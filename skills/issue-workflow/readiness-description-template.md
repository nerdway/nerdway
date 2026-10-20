# Readiness description

The PR/MR description rewritten for a human reviewer once the Criteria
verification table is complete. On a client repository it is the only text
the other developers read, and they have no access to the tracker: the
description has to stand on its own. `issue-workflow` step 6b says when it is
written and how it reaches the PR/MR; this file says what it holds.

## Rules

- **Language.** Write in the language of the repository's merged PRs/MRs
  (`pr.list-merged`, then `pr.view` on one of them) and of its `README.md`.
  When the two disagree, the PRs win. Translate the headings too.
- **Issue codes only in the magic-word lines.** The body opens with the lines
  the VCS adapter's `## Magic words` section gives (`Fixes <ID>`, one per
  issue; on Azure DevOps with Linear also the issue URL under it). Nowhere
  else: no issue code, no tracker link, no comment link, no path the
  repository does not track, no assistant name.
- **Facts from the work, not from memory.** Write from the diff
  (`main...HEAD`), the Criteria verification table and the review results.
- **Sections in the order below.** Every section is required except
  After merge, which appears only when someone has to act after the merge (a
  migration, a configuration change, a deploy step, a release). With no such
  step, leave the heading out.
- **The marker is the last line**, verbatim. It tells a later run that this
  description may be overwritten.
- **Short.** A reviewer reads it in a few minutes; lists for the changes,
  prose for the reasons.

## Sections

| Section | What it holds |
|---------|---------------|
| Why | the problem and who has it, in one paragraph |
| What changed | the changes grouped by area, naming the files or modules; behaviour before and after where it changed |
| Scope | what the change covers, and what it deliberately leaves out |
| Evidence | the Criteria verification table: criterion, check, result, evidence. Each criterion is rewritten without issue codes or tracker links; the evidence is the command and what it reported |
| Merge risk | whether the merge is a one-way or a two-way door: two-way when reverting the merge undoes everything, one-way when something stays after a revert (a data migration, a published release, a changed external API, a message already sent). Then the blast radius: which users, systems or other code the change reaches |
| After merge | the steps to take after the merge, only when there are some |

## Body

```markdown
Fixes <ID>

## Why

<the problem and who has it>

## What changed

- <area>: <change, before and after>

## Scope

<what the change covers>. <what it leaves out>.

## Evidence

| Criterion | Check | Result | Evidence |
|-----------|-------|--------|----------|
| <criterion> | <command or review> | pass | <what it reported> |

## Merge risk

<two-way or one-way door, and why>. <blast radius>.

## After merge

- <step>

<!-- nerd4rent:pr-body -->
```
