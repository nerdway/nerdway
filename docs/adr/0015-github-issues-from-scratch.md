# The public tracker is GitHub Issues, started from scratch

This repository's user-owned nerdway platform config names GitHub as the
tracker and `nerdway/nerdway` as the repo (ADR-0018). The grilling session
of 2026-11-04 chose
GitHub Issues as the public tracker and chose not to migrate the private
Linear workspace.

**Public work on nerdway is tracked in GitHub Issues on this repository,
opened as new issues. Private Linear issues are not imported, mirrored, or
linked from the README.** Linear remains a tracker the plugin can drive in
other repositories (the product still ships a Linear adapter). The public
project does not use that workspace as its own board.

Starting from scratch means the public issue list has no private identifiers,
no private workspace URLs, and no expectation that a numbered GitHub issue
corresponds to a private ticket.

## Considered Options

- **Migrate the private Linear workspace into GitHub Issues** (import,
  redirect, or a mapping table in the README) — rejected: the public
  tracker would inherit private issue identifiers, workspace URLs, and
  discussion that was never meant to be public, and the two boards would
  have to stay mapped forever.
- **Keep Linear as the public tracker for nerdway** — rejected: the public
  repository is on GitHub, GitHub Issues is available to every clone
  without a second vendor account, and the grill wanted the public board
  on the same host as the code.
- **No public tracker; pull requests only** — rejected: the plugin's own
  workflow expects an issue as the spec carrier (ADR-0008). The public
  project should run that workflow on itself.
- **GitHub Issues from scratch, no Linear migration** — chosen.

## Consequences

- `README.md` points at GitHub Issues. It does not point at a Linear
  workspace.
- The user-owned nerdway config (ADR-0018) records `tracker: github`
  with `github.owner: nerdway` and `github.repo: nerdway`.
- Examples in docs keep using generic issue ids such as `DEMO-123` or
  `#123`. They do not cite private workspace prefixes.
- Closing a public GitHub issue does not close anything on the private
  board. Dual-track work that exists on both sides is coordinated by
  maintainers, not by an importer.
