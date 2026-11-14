# Collapsed details in the readiness PR/MR description

The grilling session on GitHub issue #18 chose a config flag, on by
default, so a readiness PR/MR description opens with a short human
summary and hides the long agent-written sections behind
`<details><summary>Details</summary>`. The layout is taken from Simon
Willison, *Hide your slop PR descriptions behind details/summary*
(2026-11-09, https://simonwillison.net/2026/nov/9/details-summary/).

**When `pr.collapse_details` is true or absent, the body is magic-word
lines, then Summary, then Why / What changed / Scope / Evidence / Merge
risk inside a Details block (blank lines so Markdown renders), then
After merge outside the block when present, then the marker. When the
flag is false, the body is the previous flat layout, with no Summary.**
The summary label is the word "Details", never a model or assistant
name. The classifier stays marker-based, so both layouts count as
readiness.

## Considered Options

- **Always collapse, no flag** — rejected: some projects want the
  flat layout they already review. A boolean that defaults on keeps
  that escape without making collapse opt-in.
- **Use the model name as the `<summary>` label** — rejected: the
  template already forbids an assistant name, and the public tree
  must not advertise a model.
- **Put After merge inside the Details block** — rejected: a human
  has to act on those steps; they stay visible.
- **Config flag on by default, Summary then Details, After merge
  outside** — chosen.

## Consequences

- `PlatformConfig` gains an optional `pr` object with
  `collapse_details` (boolean). Validation rejects any other type.
  Absent key = `true`. Merge is still per top-level key: a project
  `pr:` replaces the defaults' `pr:` whole.
- `validate-platform-config.ts --print pr.collapse_details` prints
  `true` or `false` (and `true` when there is no config).
- `determine-platform` carries an existing top-level `pr` key the
  same way it carries `statuses`.
- `issue-workflow` step 6b reads the flag and picks the body from
  `readiness-description-template.md`. `auto-issue-mode` follows that
  step. `issue-close` does not rewrite the description; both layouts
  pass its marker-based gate.
