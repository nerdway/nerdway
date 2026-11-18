# Config section API

This page is the reference for the public config **section** API in
`scripts/lib/config-sections.ts`. Built-in settings and any future
third-party settings go through the same register / read / write path.
There is no extension loader in this plugin: nothing here discovers,
loads or installs third-party code. A caller that already has a section
definition registers it on a registry and then reads or writes it.

The files themselves stay YAML 1.2 in the user-owned store
(`<config dir>/config.yml` defaults merged with
`<config dir>/<project-slug>/config.yml`). See
[ADR-0023](adr/0023-config-section-contract.md).

## Scope

A **core** section owns one or more top-level keys. The built-in
sections are:

- `platform` - `tracker`, `vcs`, `statuses`, `linear`, `github`,
  `gitlab`, `ado`, `jira`
- `wiki` - `wiki`
- `pr` - `pr`
- `slack` - `slack`

An **extension section** owns exactly `extensions.<id>`. The id must
match `^[a-z][a-z0-9-]*$`. Core sections keep their own top-level keys;
they cannot claim `extensions`.

```yaml
tracker: github
vcs: github
wiki:
  path: ~/notes
pr:
  collapse_details: true
slack:
  owner: U0123456789
  channel: C0123456789
  autonomous: false
extensions:
  demo:
    enabled: true
```

## Schema subset

A section describes valid config with a JSON Schema subset, validated
in-house (no extra dependency). Allowed keywords:

- `type`: `object`, `array`, `string`, `number`, `integer`, `boolean`
- `properties`, `required`, `additionalProperties`, `items`
- `enum`, `const`
- `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`
- `default`, `description`

Registration rejects any other keyword (`$ref`, `oneOf`, `format`,
tuple `items`, and the rest), so a schema never silently means less
than it says. Errors from `validateAgainstSchema(value, schema, path)`
use a dotted path, for example `extensions.foo.bar: expected boolean`.
Missing properties that declare `default` are filled by
`applyDefaults(value, schema)`.

A core section may add a `validate` function for rules a schema cannot
express (the platform's tracker-adapter checks). An extension section
may not.

## Registry

```ts
import {
  createSectionRegistry,
  defineSection,
  getSection,
  listSections,
  readSection,
  registerSection,
  writeSection,
} from "./lib/config-sections.ts";

const demo = defineSection({
  id: "demo",
  scope: "extension",
  description: "Example extension section",
  schema: {
    type: "object",
    properties: { enabled: { type: "boolean" } },
    required: ["enabled"],
  },
});

const registry = createSectionRegistry();
registry.registerSection(demo);
```

Calling `createSectionRegistry()` returns a mutable copy of the built-in
registry (platform, wiki, pr, slack already registered). The module default is
that same set, frozen, so tests and a future loader do not share
mutable global state. Calling `registerSection(def)` without a registry
uses the frozen default and throws.

Registration rejects duplicate ids, core key collisions, a core section
claiming `extensions`, an invalid extension id, a `validate` function
on an extension section, and an unsupported schema keyword.

The functions `listSections()` and `getSection(id)` read the registry.

## Read and write

The call `readSection(id, { repoRoot, env })` loads the defaults file
and the project overlay, takes that section only, applies schema
defaults, and returns
`{ status: "absent" | "found" | "invalid", value, errors }`.
Pass `layer: "defaults"` or `layer: "project"` to read one file.
Errors are scoped to the section (`pr.collapse_details: expected boolean`,
`extensions.demo.enabled: expected boolean`).

The call `writeSection(id, value, { target: "defaults" | "project", repoRoot, env })`
validates first, then patches through `patchSection` (a top-level key,
or the `extensions.<id>` path). Comments and every other section stay.

Platform, wiki, pull-request and Slack readers use this API:
`readPlatformConfig`, `writePlatformConfig`, `resolveVault`,
`readSlackConfig` and
`validate-platform-config.ts --print pr.collapse_details`. They do not
keep a private list of keys. The `slack` section has no writer CLI; the
user edits the YAML and `validate-platform-config.ts` checks it.

## Unknown content

- An unknown top-level key is preserved and reported as a notice that
  suggests `extensions:`.
- An unregistered `extensions.<id>` entry is preserved and reported as
  `extensions.<id>: no section registered`.
- An `extensions` value that is not a map is an error.

## Worked example

A tool that wants a boolean flag registers an extension section, writes
it into the project overlay, and reads it back without touching `wiki`
or the platform keys:

```ts
const registry = createSectionRegistry();
registry.registerSection(
  defineSection({
    id: "demo",
    scope: "extension",
    description: "Demo flag",
    schema: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
    },
  }),
);

writeSection("demo", { enabled: true }, {
  repoRoot,
  env: process.env,
  target: "project",
  registry,
});

const read = readSection("demo", { repoRoot, env: process.env, registry });
// read.status === "found", read.value === { enabled: true }
```

The YAML wrapper still owns parse and patch. This module owns which
keys are a section, how they validate, and how they are merged.
