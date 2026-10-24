# Platform adapters as reference files at the plugin root

*Amended by DEMO-318: the workflow islands (`workflows/*.js`) and their agents (`agents/*.md`) name operation IDs too. A script cannot read files (ADR-0003) and a subagent's `${CLAUDE_PLUGIN_ROOT}` is unverified, so the calling skill resolves the adapter paths and passes them as `args.platform.adapters`; a `null` path becomes a `gaps` entry, never another platform's command. The adapter contract gains the read operations the islands need: `issue.read-relations`, `pr.view`, `pr.diff`, `pr.list-merged`.*

*Amended by ADR-0006 (DEMO-303): tracker adapters gain a required `## Status strategies` section (rule 25) and the operations `status.list`, `label.list`, `label.create`; `issue.read-status` and `issue.set-status` now read and write a canonical phase through the configured status strategy, and `## Statuses` declares the adapter's default strategy and map.*

*Amended by DEMO-304: branch creation becomes the tracker operation `issue.create-branch`. On Linear it stays `git checkout -b <branchName>`; GitHub Issues creates the branch with `gh issue develop`, which also links it to the issue in the GitHub UI. A plain git command in `issue-start` would have been a platform command quoted in a skill, and a per-adapter note would have left the skill to improvise.*

*Amended by DEMO-454: the vault is a third axis, `adapters/vault/<tier>.md`, selected by the tier rather than by the platform config, because a repo does not know where its vault is; the selector enum is `EntityPageUpdate.tier` (`file`, `mcp`), so rule 24 holds unchanged with an enum outside `PlatformConfig`. `nerdbrain-wiki` and `nerdbrain-search` name operation IDs (`page.read-section`, `page.replace-section`, `vault.search`, `graph.hop1`, ...) and the recipes moved out of them verbatim. A node that runs through an axis names it in `adapters` and the validator rejects an undeclared axis (rule 26). The planning island receives the vault adapter path as `args.platform.adapters.vault`, like the two others.*

Every core skill used to carry its Linear, GitHub and GitLab commands inline,
so supporting another tracker (GitHub Issues, GitLab Issues, Azure DevOps
Boards) or another VCS host (Azure DevOps Repos) would mean editing every
skill once per platform. We split the platform out along **two independent
axes** — tracker and VCS host — and put each platform's commands into one
markdown **adapter file** at the plugin root: `adapters/trackers/<name>.md`
and `adapters/vcs/<name>.md`. Skills name **operation IDs**
(`issue.set-status`, `pr.merge`, …) and never quote a command; they read the
adapter through `${CLAUDE_PLUGIN_ROOT}`, which Claude Code substitutes in
plugin skill content. Which adapter to read comes from the **platform
config**: a `## Platform` section in the repo `CLAUDE.md`, mirrored as
`platform:` on the nerdbrain entity page and established by
`determine-platform`.

The adapter contract is data, not prose: the `adapters` block of
`workflow-graph.json` declares, per axis, the required sections and the
operation IDs, and `scripts/validate-workflow-graph.ts` rejects an adapter
missing a section, missing or repeating an operation, listing an undeclared
one, or named outside the `PlatformConfig` enum (rule 24).

## Considered Options

- **Adapters as skills** (`linear-tracker`, `github-vcs` invoked via `Skill`) —
  rejected: a skill invocation expands a whole prompt and competes for
  triggering with the core skills; an adapter is reference data, not
  behaviour.
- **Command tables inline in every skill** (the status quo, one table per
  platform) — rejected: N skills × M platforms of duplicated recipes, and a
  gotcha fixed in one skill stays broken in the others.
- **A CLI shim** (`n4r issue set-status …` dispatching to `linearis`/`gh`/`az`)
  — rejected: a compiled or scripted layer to install, version and test on
  every machine, in a plugin that is otherwise markdown plus offline
  validators.
- **One plugin per platform** — rejected: the tracker and VCS axes combine
  freely (Linear + GitLab, Linear + Azure DevOps), so per-platform plugins
  multiply into per-combination plugins.
- **A copy of the adapters inside each skill directory plus a drift check** —
  rejected: seven copies to keep byte-identical for no benefit inside a
  plugin, where one shared path already resolves.
- **A "library" skill holding the adapters** — rejected: it would have to be
  invoked to be read, and its description would pollute skill triggering.

## Consequences

- **Portability cost:** `${CLAUDE_PLUGIN_ROOT}` exists only when the skills
  run as a Claude Code plugin. An agent reading the skills as raw Agent Skills
  directories (for example through `npx skills`) gets no substitution and no
  `adapters/` next to the skill; skills fall back to "two directories up from
  the skill base directory", which holds for a plugin checkout but not for a
  copied skill directory.
- A core skill that finds no adapter file for the configured value stops with
  "adapter not available yet" — it never falls back to Linear. A config naming
  such a platform is still legal to record.
- An operation a platform does not offer is listed with the command `—`, so
  the table stays complete for the validator and the skill stops loudly
  instead of improvising.
- The platform config lives in the committed repo `CLAUDE.md`, client repos
  included, because it must travel with the repo into every worktree; other
  developers' agents have no nerd4rent skills and ignore the section.
- Writing that one section is exempt from `no-repo-change-before-in-progress`,
  recorded as a validated `exemptions` entry on the frozen rule (rule 23)
  rather than in prose.
- Legacy entity pages with only `linear:` keep working: it is read as an alias
  of `platform:` and replaced on the first mirror write, with no bulk
  migration.
