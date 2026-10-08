# Contributing

This document is for developers who change the plugin itself: how to check a change locally and how to cut a release. How the pieces fit together is in [ARCHITECTURE](ARCHITECTURE.md); the coding standards a review checks a change against are the `## Standards` section of [`CONTEXT.md`](../CONTEXT.md), and the decisions behind the design are in [`docs/adr/`](adr/).

## Checking a change

The checks need Node.js 22 or newer and nothing else: there is no `package.json` and no build step. Run every command from the repository root.

Run the test suite (keep the glob quoted, so Node expands it rather than the shell):

```bash
node --test 'scripts/**/*.test.ts'
```

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

Check the evals of every skill that has them:

```bash
node scripts/validate-evals.ts
```

After editing a schema body in `workflow-graph.json`, regenerate the skill templates built from it. A test fails if one of them was edited by hand instead:

```bash
node scripts/render-templates.ts
```

## Releasing

Three manifests carry a version, and they move together:

- `.claude-plugin/plugin.json` → `version`
- `.claude-plugin/marketplace.json` → `metadata.version`
- `.cursor-plugin/plugin.json` → `version`

The Claude Code installed version comes from `.claude-plugin/plugin.json`. Bumping it is what forces Claude Code to refresh its `cache/<marketplace>/<plugin>/<version>/` copy: an unchanged number makes `/plugin update` a no-op even when `main` has moved on. The marketplace file versions the marketplace itself and does not drive that cache. The Cursor manifest must stay on the same string so both runtimes see one release.

Bump the version when a change reaches what the plugin loads at runtime: skills, agents, adapters, hooks, workflows, manifests. A change limited to `docs/` or to the README changes nothing an installed plugin reads, so it ships without a bump.

Claude Code must never see a Cursor file: it reads `hooks/hooks.json` and a root `plugin.json` by convention, whatever its manifest says, and the claude.ai marketplace sync rejects what the CLI only warns about ([ADR-0007](adr/0007-dual-runtime-packaging.md)). Cursor's hooks therefore live in `hooks/cursor.hooks.json`, named in `.cursor-plugin/plugin.json`. The sync also checks claude.ai's upload rules, which the CLI does not, and reports a breach as a warning: the plugin description is at most 500 characters (one text in all four manifests), and a skill or agent `name` or `description` holds no `<` or `>` (write `{slug}`, not `<slug>`).

Before every release, run the five guards below. CI runs all of them except `validate-platform-references.ts` on every pull request and every push to `main`.

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
