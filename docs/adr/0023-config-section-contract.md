# Config section contract

*2026-11-15.*

#23 added an internal registry of known top-level config keys (platform,
`wiki`, `pr`) and kept unknown keys as notices. Every new setting still
meant editing that array and adding ad-hoc readers and writers, the
same pattern that caused #21.

**A section is registered through a public API
(`defineSection` / `registerSection` / `readSection` / `writeSection`
in `scripts/lib/config-sections.ts`). Valid config is a declarative
JSON Schema subset, validated in-house. Built-in sections may add a
`validate` function; an extension section may not. Core sections own
top-level keys; anything outside the core lives at `extensions.<id>`.
Unknown top-level keys and unregistered `extensions.<id>` entries are
preserved as notices. This issue does not load or discover third-party
code.**

The schema subset is `type` (object, array, string, number, integer,
boolean), `properties`, `required`, `additionalProperties`, `items`,
`enum`, `const`, `minimum`/`maximum`, `minLength`/`maxLength`,
`pattern`, `default`, `description`. Unsupported keywords are rejected
at registration so a schema never silently means less than it says.

The registry is created per call (`createSectionRegistry()`). The
built-in registry (platform, wiki, pr) is a frozen default. Writes go
through the YAML wrapper's `patchSection`, so comments and every other
section stay. See [CONFIG-SECTIONS](../CONFIG-SECTIONS.md).

## Considered Options

- **Keep the internal array and add ad-hoc readers** — rejected: that
  is the #21 pattern. Every new setting would edit core.
- **Allow a `validate` function on extension sections** — rejected:
  third-party code is out of scope, and a schema is the contract those
  loaders will ship. Core keeps an optional function for adapter-bound
  rules the platform already had.
- **Let extensions own arbitrary top-level keys** — rejected: the grill
  put them under one `extensions:` map so core keys stay stable and an
  unknown top-level key can still be a notice that points at
  `extensions:`.
- **Discover and load third-party manifests in this change** — rejected:
  the grill deferred the loader. The API must not assume how extensions
  will be loaded.
- **A public section API with a schema subset, `extensions.<id>`, and
  no loader** — chosen.

## Consequences

- `readPlatformConfig`, `writePlatformConfig`, `resolveVault` and the
  `pr.collapse_details` reader call `readSection` / `writeSection`.
  Callers no longer keep `PLATFORM_KEYS` / `WIKI_KEYS` / `PR_KEYS` or
  `platformPart`.
- A non-map `extensions` value is an error. An unregistered
  `extensions.<id>` is a notice. An unknown top-level key is a notice
  that suggests `extensions:`.
- ADR-0022's "public extension API is out of scope" is superseded for
  registration, read and write; the loader remains out of scope.
