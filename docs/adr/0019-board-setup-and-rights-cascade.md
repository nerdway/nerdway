# Board setup and the rights cascade

The grilling session on GitHub issue #7 chose a separate `board-setup`
skill that reads the viewer's real rights, creates missing statuses /
columns / labels with consent, and records the map through
`bind-statuses`. This amends ADR-0006: the three strategies stay, but
how a project gets onto one of them is no longer "bind-statuses creates
labels".

**`board-setup` picks the highest cascade level the viewer can use
(`native`, else `label`, else `comment`), creates what is missing only
after an explicit yes, and hands the strategy and map to
`bind-statuses`.** A 403 on write drops exactly one level and asks
again. `unknown` is a first-class right and the skill asks. GitHub
gains a `native` strategy backed by the Projects (v2) Status field;
`label` stays the GitHub default.

## Considered Options

- **Extend `bind-statuses` to create board statuses** — rejected: the
  grill kept mapping and board edits as two skills. `bind-statuses`
  remains mapping only.
- **Write-then-catch-403 as the primary rights check** — rejected:
  proposals must be right before the user approves. Rights come from
  the tracker API first (`viewerCanUpdate`, access level, team admin);
  403 is only the fallback that drops one cascade level.
- **Jira REST workflow writes with a stored token** — rejected: no
  stored secrets, and `acli` has no workflow-write command. The skill
  lists missing names and links the workflow editor.
- **A fourth `column` strategy** — rejected earlier in ADR-0006; Azure
  DevOps columns stay `native`. GitLab board lists stay `label`,
  because they are label lists, not a separate state field.
- **A separate skill, rights cascade, GitHub Project Status as
  `native`** — chosen.

## Consequences

- Two new tracker operations, `board.rights` and `status.create`, are
  in the adapter contract. Every tracker adapter declares both, with a
  recipe or `—` and a reason.
- `linearis` has no team workflow-state command, so Linear
  `status.create` is the guided path (list, link team workflow
  settings, read back). Never `workflowStateCreate`.
- `PlatformConfig.github.project` is the Project (v2) number. GitHub
  `native` requires it. `determine-platform` records it when the repo
  uses a Project; `board-setup` may write it later. `--keys github`
  replaces the whole `github` object.
- `updateProjectV2Field` replaces the Status option list: the GitHub
  `status.create` recipe snapshots every item's Status, verifies after
  the write, and re-applies lost values.
- The `board-setup` node is irreversible, behind a `chat-approval`
  gate on `no-tracker-label-without-consent`, and exempt from
  `no-repo-change-before-in-progress` (it changes no repo file).
- The live smoke test on the nerdway GitHub Project (add In Review,
  snapshot diff) is a maintainer step with explicit consent, not part
  of merging this change.
