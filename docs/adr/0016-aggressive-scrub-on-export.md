# Export rewrites private infrastructure out of the public history

A `git filter-repo` export (ADR-0014) is not only an English rewrite of
commit messages. The grilling session of 2026-11-04 chose an aggressive
scrub: the public history must not name homelab products and hosts, private
filesystem or machine paths, or the private Linear workspace (its issue
prefixes and its site URLs).

**Every export runs a replace-text pass that strips those strings from
file contents and from commit messages, then a dry-run search that must
report zero hits on the rewritten clone.** A light pass that left private
ticket ids or host names in place was rejected. Secrets and personal data
are included in the same pass; they are not the only target.

The public tree may still describe the dual-track procedure and name the
private plugin as the source of an export. That is a present-tense
maintainer document, not a leak of homelab inventory. The patterns the
search looks for, and the files allowed to mention them, live in
`docs/DUAL-TRACK.md` and `scripts/scrub-check.ts`.

## Considered Options

- **Minimal scrub** (secrets and personal data only; leave host names,
  homelab products, and private ticket prefixes in history) — rejected:
  the public clone would still document a private lab and a private
  board.
- **Light scrub** (drop secrets and home paths, keep ticket prefixes and
  generic host names) — rejected: those prefixes and names still point at
  the private workspace and lab, and they fail the "from scratch" public
  tracker (ADR-0015).
- **Aggressive scrub** of homelab products and hosts, private paths, and
  private Linear prefixes and URLs, with a dry-run search that must be
  empty — chosen.

## Consequences

- Maintainers keep a replace-text file next to the export clone (not in
  this repository's required path) and re-run it on every export. The
  public tree documents the patterns and the dry-run; it does not require
  a particular machine layout.
- After a rewrite, `git grep` / `rg` over the export clone must print
  nothing for those patterns. `node scripts/scrub-check.ts` is the same
  search for this repository, with the dual-track guide and the checker
  itself exempt so they can name the patterns.
- Finding a hit after a rewrite means the replace-text file is incomplete.
  The fix is another rewrite of the export clone, then a push to
  `nerdway/nerdway` only (ADR-0014), not an edit that leaves the string in
  older public commits.
- Open-core and a second license were out of scope for this scrub. MIT
  plus paid support (see `docs/SUPPORT.md`) is the commercial model; the
  scrub does not carve a proprietary subdirectory out of the tree.
