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
  repository does not track, no assistant name, no model name, no tool name.
- **Facts from the work, not from memory.** Write from the diff
  (`main...HEAD`), the Criteria verification table and the review results.
- **Layout from `pr.collapse_details`.** Read the flag with one CLI call
  (missing key, missing config and `true` all mean collapsed):

  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/validate-platform-config.ts --print pr.collapse_details "$(git rev-parse --show-toplevel)"
  ```

  `true` → **Body (collapsed)**. `false` → **Body (flat)**. Exit 4 or 5 →
  stop as `adapters/platform.md` says.
- **Sections in the order of the chosen body.** Every section in that body
  is required except After merge, which appears only when someone has to act
  after the merge (a migration, a configuration change, a deploy step, a
  release). With no such step, leave the heading out. Summary exists only in
  the collapsed body.
- **Collapsed Details must render.** A blank line after the `<summary>` line
  and a blank line before `</details>`, so Markdown inside the block renders
  on GitHub, GitLab and Azure DevOps.
- **The marker is the last line**, verbatim. It tells a later run that this
  description may be overwritten.
- **Short.** A reviewer reads the Summary in a few seconds and the rest in a
  few minutes; lists for the changes, prose for the reasons.

## Sections

| Section | What it holds |
|---------|---------------|
| Summary | 2-4 sentences in plain words: what changes, why, and anything the reader must do. Collapsed layout only |
| Why | the problem and who has it, in one paragraph |
| What changed | the changes grouped by area, naming the files or modules; behaviour before and after where it changed |
| Scope | what the change covers, and what it deliberately leaves out |
| Evidence | the Criteria verification table: criterion, check, result, evidence. Each criterion is rewritten without issue codes or tracker links; the evidence is the command and what it reported |
| Merge risk | whether the merge is a one-way or a two-way door: two-way when reverting the merge undoes everything, one-way when something stays after a revert (a data migration, a published release, a changed external API, a message already sent). Then the blast radius: which users, systems or other code the change reaches |
| After merge | the steps to take after the merge, only when there are some. Stays outside the Details block, because a human must act on it |

## Body (collapsed)

Default. `pr.collapse_details` true or absent.

```markdown
Fixes <ID>

## Summary

<2-4 sentences: what changes, why, and anything the reader must do>

<details>
<summary>Details</summary>

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

</details>

## After merge

- <step>

<!-- nerdway:pr-body -->
```

## Body (flat)

`pr.collapse_details: false`. Today's layout: no Summary, no Details block.

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

<!-- nerdway:pr-body -->
```
