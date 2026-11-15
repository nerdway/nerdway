# Vendored yaml library and config section registry

*2026-11-15. Amended by ADR-0023: the registry is now the public
section API (`defineSection` / `readSection` / `writeSection`);
unknown keys still stay. The extension loader remains out of scope.*

nerdway used to read and write YAML with a hand-written subset parser
(`parseYaml` / `emitYaml`). That subset dropped comments on write, rejected
block scalars and flow collections, and re-emitted the whole file, so any
key the writer did not know about disappeared. Each reader also decided on
its own which top-level keys counted as "a platform config".

**YAML is parsed by a vendored copy of the `yaml` library (ISC, 2.9.1)
under `vendor/yaml/`, loaded by `node` with no install step. One wrapper
(`scripts/lib/yaml.ts`) is the only importer. A config-sections registry
validates known top-level sections separately; unknown sections are kept
and reported as notices; writers patch only the section they change.**

The plugin is installed by copying the repo. There is no `package.json`.
The vendored tree is the upstream ESM (browser) build, plus `LICENSE` and
`VERSION.json` (version, tarball URL, sha256 of each file).
`scripts/vendor-yaml.ts <version>` refreshes it;
`scripts/validate-vendor.ts` fails CI when a checksum drifts.

Parse settings are YAML 1.2 core, duplicate keys are errors, custom tags
are rejected, and aliases are capped against a billion-laughs payload.
`patchSection` edits through the Document API so comments, key order and
untouched sections survive.

The registry's known sections are platform (tracker, vcs, statuses and
adapter ids), `wiki`, and `pr`. Platform presence is any platform key
(the rule from ADR-0021 / GitHub issue #21, without an ad-hoc exclusion
list). A public API for third-party section registration is out of
scope; keeping unknown keys is enough for this change.

## Considered Options

- **Keep the hand-written subset** - rejected: it cannot accept valid YAML
  a user writes, and every write destroyed comments and unknown keys.
- **Add `package.json` and install `yaml` at runtime** - rejected: the
  plugin must keep working as a copied tree with nothing but Node.
- **Vendor the Node CJS build** - rejected: the ESM browser build has no
  Node built-ins and loads under a nested `"type": "module"` package.
- **A public extension API for sections** - deferred: this issue makes
  the registry internal and preserves unknown keys.

## Consequences

- Every YAML read and write in `scripts/` and `hooks/` goes through the
  wrapper. A guard test fails when another file imports `vendor/yaml` or
  reimplements YAML parsing.
- `writePlatformConfig` and the migration writer patch sections instead
  of re-emitting the file.
- Existing files produced by the old emitter still read as the same
  objects (regression fixtures).
- `claude plugin validate` still has to stay green with `vendor/` in the
  tree.
