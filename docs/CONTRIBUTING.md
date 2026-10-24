# Contributing

This document is for developers who change the plugin itself: how to check a change locally and how to cut a release. How the pieces fit together is in [ARCHITECTURE](ARCHITECTURE.md); the coding standards a review checks a change against are the `## Standards` section of [`CONTEXT.md`](../CONTEXT.md), and the decisions behind the design are in [`docs/adr/`](adr/).

## Checking a change

The checks need Node.js 24 or newer and nothing else: there is no `package.json` and no build step. Run every command from the repository root.

Run the test suite (keep the glob quoted, so Node expands it rather than the shell):

```bash
node --test 'scripts/**/*.test.ts' 'hooks/*.test.ts'
```

The hook tests sit next to the hooks. They cover the session-start inject, the issue reminder and gate of `hooks/require-issue.ts` (including runs against throwaway git repos), and the commands in `hooks/hooks.json` and `hooks/cursor.hooks.json`.

Check that every edge, gate and adapter in the workflow contract is consistent:

```bash
node scripts/validate-workflow-graph.ts
```

Check the CLI dependency list the `bootstrap-clis` skill installs from:

```bash
node scripts/validate-cli-dependencies.ts
```

Check the `## Platform` config of this repo and the default status map of every tracker adapter:

```bash
node scripts/validate-platform-config.ts
```

Check the evals of every skill that has them. The check reads `skills/*/evals/evals.json` and reports a missing or mistyped field, a `skill_name` that differs from the skill's directory and an `id` used twice; it runs no model:

```bash
node scripts/validate-evals.ts
```

Check that every term of the `## Language` glossary in `CONTEXT.md` is used, as the same phrase in any letter case, in at least one tracked file outside `CONTEXT.md` and `docs/research/`. A term nothing else uses is dead vocabulary: use it where its concept is described, or drop it.

```bash
node scripts/validate-context-terms.ts
```

Run the session-start install check by hand, the way the hooks in `hooks/hooks.json` (Claude Code) and `hooks/cursor.hooks.json` (Cursor) run it. The three environment variables exist for this run only: `NERD4RENT_MAIN_VERSION` replaces the version fetched from `main` and skips the network, `NERD4RENT_SKILL_DIRS` replaces the scanned skill directories (colon-separated; empty scans nothing), `NERD4RENT_CACHE_DIR` moves the 24-hour cache. An installation that is current prints nothing:

```bash
echo '{"cwd":"'"$PWD"'"}' | NERD4RENT_MAIN_VERSION=9.9.9 NERD4RENT_SKILL_DIRS= node scripts/check-install.ts --runtime claude
```

After editing a schema body in `workflow-graph.json`, regenerate the skill templates built from it. A test fails if one of them was edited by hand instead:

```bash
node scripts/render-templates.ts
```

CI runs the test suite and every check in this section on every pull request and every push to `main`, together with the release guards below. `render-templates.ts` is the exception: it is a generator, not a check, and the test suite already fails when a template drifts from the contract.

## Running the evals

The checks above only look at the shape of the eval files. To see whether the skills actually behave as the cases say, run them through Claude Code's eval runner, `claude plugin eval`. It needs Claude Code 2.1.269 or newer with plugin evals enabled (an early-access feature), and it runs on your own login: every case is a real Claude Code session plus a few judge calls, billed to your plan or API account like any other session.

`evals.json` stays the only place the cases are written. `scripts/run-evals.ts` converts them into the runner's format in a temporary `eval-cases/<timestamp>/` directory, starts `claude plugin eval` on the repository root and deletes the directory afterwards. Each eval becomes one case: the prompt as written, one judge grader per assertion, one for the expected output, and a check that the skill was invoked. The sessions get only Read, Glob, Grep and Skill. With no shell and no MCP tools they cannot reach the tracker or the VCS host, so a case states its facts in the prompt and the graders judge the steps and the decision the answer describes.

Run the evals of one skill, three runs per case (the runner's default), keeping the report local:

```bash
node scripts/run-evals.ts --skill issue-close --no-publish
```

`--skill` can be repeated; without it every skill with an `evals.json` runs. Every other option goes to `claude plugin eval` unchanged, for example `--runs 1`, `--max-cost-usd 5`, `--case 'issue-close--merge-*'`, `--model`, `--judge-model` or `--json results.json`. Granting Bash or an MCP tool (`--allow-tools Bash`, `--allow-tools 'mcp__*'`), `--mocks off`, `--allow-real-servers`, `--scaffold` and `--eval-dir` are refused, because they would let a run reach real services or bypass the converter. `--dry-run` writes the cases and prints the command without running anything; `--keep-cases` keeps the converted cases after the run so you can read them.

Mind the cost before a full run. By default every case runs three times with the plugin and three times without it, to measure what the plugin adds, and each judge grader votes three times on every run. With about 25 cases in the three core skills that is around 150 sessions. `--runs 1` and `--ablation none` (no run without the plugin) cut that to about 25.

`--max-cost-usd` is checked between cases, not inside one: a case that starts below the ceiling runs to its end, so the total can pass the ceiling by the cost of one case. The case that crosses it keeps its session but skips its judge graders, so its score is not a verdict, and the cases after it do not run at all. The run then exits with code 2 and keeps the partial results. In the first recorded run (Claude Code 2.1.296, `--runs 1 --ablation none`) a case cost between $0.19 and $0.43, about $0.26 on average, so the 25 cases of the three core skills need about $6.50. Set the ceiling to the expected total plus one case, or run the skills in separate batches with `--skill` (or the missing cases with `--case`), rather than a ceiling below the total that ends the run early.

The first run in a directory asks whether you trust it; answer yes, or pass `--trust-plugin` when nobody can answer.

Results go to `results/<timestamp>/`: `aggregate-result.json` with the score of every case, its cost, and the Claude Code version, and `report.html` with every grader's verdict and the judge's explanation. Both `results/` and `eval-cases/` are ignored by git. A case passes when its score reaches `--threshold` (1.0 by default), so the command exits 1 as soon as one case scores below it. Read the report rather than the exit code alone. CI does not run the evals, since they need a login and cost money.

## Releasing

Three manifests carry a version, and they move together:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`
- `.cursor-plugin/plugin.json` → `version`

The Claude Code installed version comes from `.claude-plugin/plugin.json`. Bumping it is what forces Claude Code to refresh its `cache/<marketplace>/<plugin>/<version>/` copy: an unchanged number makes `/plugin update` a no-op even when `main` has moved on. The marketplace file versions the marketplace itself and does not drive that cache. The Cursor manifest must stay on the same string so both runtimes see one release.

Bump the version when a change reaches what the plugin loads at runtime: skills, agents, adapters, hooks, workflows, manifests. A change limited to `docs/` or to the README changes nothing an installed plugin reads, so it ships without a bump.

Claude Code must never see a Cursor file: it reads `hooks/hooks.json` and a root `plugin.json` by convention, whatever its manifest says, and the claude.ai marketplace sync rejects what the CLI only warns about ([ADR-0007](adr/0007-dual-runtime-packaging.md)). Cursor's hooks therefore live in `hooks/cursor.hooks.json`, named in `.cursor-plugin/plugin.json`, while `hooks/hooks.json` holds only Claude Code hooks in Claude Code's format; `validate-manifests.ts` rejects a Cursor-shaped file at that path and any root `plugin.json`. Each Cursor command starts with `node` ([ADR-0007](adr/0007-dual-runtime-packaging.md)): a bare `.sh` path is opened through the Windows file association, which does not connect the hook's stdin and stdout. `hooks/check-install.sh` stays the Claude Code entry of the install check; the Claude Code issue hooks call `node` directly, so a missing `node` is a non-blocking hook error that lets the action through. Cursor calls `node ./scripts/check-install.ts --runtime cursor` directly. The sync also checks claude.ai's upload rules, which the CLI does not, and reports a breach as a warning: the plugin description is at most 500 characters (one text in all four manifests), and a skill or agent `name` or `description` holds no `<` or `>` (write `{slug}`, not `<slug>`).

Before every release, run the five guards below. CI runs all of them on every pull request and every push to `main`.

Check that the three versions are equal, that the Cursor manifest fits Cursor's schema, that nothing Cursor-only sits at Claude Code's paths, and that the claude.ai upload rules hold:

```bash
node scripts/validate-manifests.ts
```

Run `claude plugin validate`, where any warning fails (needs the Claude Code CLI):

```bash
node scripts/validate-claude-plugin.ts
```

Check that every mention of `## Platform` in a skill, agent or adapter reads `CLAUDE.md` through `adapters/platform.md`:

```bash
node scripts/validate-platform-references.ts
```

Check that no tracked file calls a skill of the `superpowers` or `mattpocock-skills` plugins ([ADR-0009](adr/0009-no-external-skill-references.md)):

```bash
node scripts/validate-external-references.ts
```

Check that the documentation for humans (`README.md` and the files directly in `docs/`) holds no em dash, following the plugin's documentation style:

```bash
node scripts/validate-human-docs.ts
```

Merging to `main` does not update anyone's install on its own. An installed copy is refreshed only by `/plugin marketplace update <marketplace>`, followed by `/plugin update <plugin>@<marketplace>`.
