# No calls to another plugin's skills

The plugin started as a layer over two external skill families: superpowers
(brainstorming, TDD, debugging, plan execution) and Matt Pocock's skills
(grilling, domain modeling, code review). Several skills named them as an
optional step — "if the grilling skill of that family is available, you may
use it" — with an inline fallback for machines without them. That tied the
plugin's behaviour to what happened to be installed: the same issue was
planned one way on a machine with the family and another way without it,
and an eval could not say which path it was testing. DEMO-371 decided that
the plugin is a self-contained framework: every practice it relies on is
its own skill (`nerd4rent:tdd`, `nerd4rent:review-verify`, the inline
grilling protocol, the practice skills of DEMO-380), and nothing in the repo
calls a skill of another plugin.

**A file tracked in this repository never calls a skill of another plugin.**
A call is the invocation form `<plugin>:<skill>` — `superpowers:<name>` or
`mattpocock-skills:<name>`. Naming the plugin or its author in prose is not a
call: an ADR may say which framework an idea follows, a skill may credit
"the pattern follows Matt Pocock's `code-review` (MIT)", research may compare
the families by name.

`scripts/validate-external-references.ts` keeps it that way. It scans every
file `git ls-files` lists, reports each call with its path and line, and
exits non-zero on the first file that is not exempt; `.github/workflows/
validate-plugin.yml` runs it on every pull request. The exempt paths are a
constant in `scripts/types/external-references.ts`, and each has a reason:

- `docs/research/` — the research documents cite and weigh the external
  skills by their invocation names; that is their subject.
- `docs/plans/` and `docs/specs/` — the four files from before ADR-0008,
  moved here verbatim from `docs/superpowers/{plans,specs}` (DEMO-376). They
  are history, kept as written, and nothing new is added to either directory.
- `scripts/types/external-references.ts` and its test — the pattern and
  the fixtures contain the strings they look for.

A new exemption is a change to this ADR, not an edit of the constant alone.

## Considered Options

- **Keep the optional references with a graceful fallback** — rejected: the
  fallback was the only path the plugin could promise, so the reference added
  a second, untested behaviour and a dependency on the machine.
- **Replace each reference with the matching `nerd4rent:` skill** — rejected
  for the grilling and domain-modeling references: the practice skills do not
  exist yet (DEMO-380), and the inline protocol works without them. The text is
  neutral until those skills land; wiring them in is that issue's change.
- **Match the bare plugin names** (`superpowers`, `Matt Pocock`) — rejected:
  ADR-0008 and the attributions planned for the practice skills must pass,
  and the criterion of DEMO-371 is "no calls", not "no mentions".
- **Scan only `skills/`** — rejected: the criterion says "the repo", and an
  agent definition, a workflow script or an adapter can call a skill too.
- **Also forbid the old archive path `docs/superpowers`** — rejected: after
  the move the directory does not exist, the reducer test pins the new
  path, and the archive files themselves still mention it as history.

## Consequences

- `scripts/validate-external-references.ts` joins the release guard block
  in the README and the CI workflow; a pull request that calls an external
  skill fails before review.

  *Amended by DEMO-377: the release guard block moved from the README to
  `docs/CONTRIBUTING.md`; the guard itself is unchanged.*
- The three skills that carried the references (`issue-writer`,
  `issue-workflow`, `nerdbrain-wiki`) describe the step inline; the grilling
  protocol itself is unchanged.

  *Amended: the inline grilling protocol moved into the plugin's own
  `nerd4rent:grill` skill, which asks in rounds; `issue-writer`,
  `issue-workflow` and `new-project-workflow` invoke it, and the manual
  `/grill-me` menu item of `new-project-workflow` is gone.*
- The planning island reads prior art from `docs/plans/` (`if present`), so
  a client repository without that directory behaves as before.
- ADR-0008 is amended: `docs/plans/` and `docs/specs/` hold only the four
  archived files and are not a place for a spec or a plan.
