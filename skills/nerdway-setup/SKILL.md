---
name: nerdway-setup
description: >-
  Find out how far this machine and the current directory are set up for
  nerdway and walk the user through what is missing or wrong, one question at
  a time: the global configuration first when there is none, then the project.
  Also reconfigures one area on request ("change the tracker of this project",
  "change my wiki path", "keep this project's config in the repo") with a
  before/after, opens a key menu in a fully configured project, and runs a
  quick preflight for other skills (`preflight --caller` plus the caller
  name). Works from a check registry, hands every tracker, VCS, board and CLI step to the skill
  that owns it, and edits only `wiki.path` and the project-config location
  itself. Use for `/nerdway-setup` / `/nerdway:nerdway-setup`, "set up
  nerdway", "configure this project", "reconfigure", or when another skill
  asks for a preflight.
---

# nerdway setup

**Orchestrate, don't abstract.** This skill reads the state, explains it and
asks. Every fix that belongs to another skill is that skill's job: invoke it
and let it run its own steps. This skill never runs a tracker, VCS, board or
install command of its own. It writes only the two things no other skill
owns: the `wiki.path` key and the location of the project config.

## Where things are

`<plugin root>` is `${CLAUDE_PLUGIN_ROOT}`, or two directories up from this
skill's base directory when that variable was not substituted. Use absolute
paths in every command:

- `<plugin root>/skills/nerdway-setup/checks.json` is the check registry.
  Every check has an `id`, a `title`, an `area`, a `scope` (`global` or
  `project`), an `explain` text, and either a `handoff` (the skill that owns
  the fix) or a `fix` (an edit this skill owns). Never hard-code a check
  here; the registry decides what is checked and in which order.
- `node "<plugin root>/scripts/setup-state.ts" "<dir>"` prints the state as
  JSON: `inRepo`, `globalConfig`, `projectConfig` (`strategy`, `path`,
  `exists`), and every check with `status` (`ok`, `warn`, `missing`,
  `unknown`), `findings` and an optional `suggestion`. Add `--check <id>` for
  one check. Exit 4 means the registry is broken: stop and show the errors.
- `node "<plugin root>/scripts/project-config.ts"` does the owned edits and
  prints a before/after as JSON:
  - `where` shows the project-config location;
  - `move --to user|repo` switches it;
  - `set wiki.path <value> --layer defaults|project` sets the wiki path.

`<dir>` is the current working directory. The two project-config locations:

- `user` (the default): `<config dir>/<slug>/config.yml`, outside the
  repository.
- `repo`: `.nerdway/config.yml` in the repository. Anyone who can read the
  repo sees it, so it never holds secrets.

## How to ask

One question per turn, then wait. Open with a short overview of what was
found (what is set, what could be better) and the first question; never dump
the whole list as a checklist.

Render each question with the first ask tool in this session's tool list:

1. Claude Code `AskUserQuestion`
2. Cursor `AskQuestion` / the ask-question tool
3. Codex `request_user_input`
4. Otherwise a numbered list. "tak", "yes" or "1" picks the recommendation,
   another number picks that option, and any other text is the user's own
   answer.

Every menu has two or three options grounded in probed values, the
recommended one first, and ends with an option to type an own answer. Every
step can be skipped or postponed ("skip", "later", "not now"). A skipped
step never stops the run; note it and move on. An unexpected answer gets a
gentle explanation and a sharper menu, never an error.

Show progress on every step, as a short `2 of 5` marker or the area name.
Nothing is written (config file, tracker, environment) without the user's
yes for that step. Show a before/after for every write.

## Starting point

Read the state first and say which checks pass and which do not. Then pick
the starting point:

1. **No global config** (`globalConfig.exists` is false). Walk the
   `scope: global` checks first, then continue with the directory.
2. **Not clearly a project** (`inRepo` is false and no project config
   exists). Ask one question: "configure this project, or the global nerdway
   configuration?" Follow the answer; do not guess.
3. **A project without project config** (`projectConfig.exists` is false).
   Walk the `scope: project` checks. Project settings go to the project
   config, never into the global defaults.
4. **A fully configured project with no request.** Open the key menu (below)
   instead of saying "all set".
5. **A request** ("change the tracker", "change my wiki path", an area name
   or a check `id` as argument). Run only the matching check; see
   Reconfiguration.

## The walk

Take the checks in registry order and skip those with `status: ok`. For each
of the others, ask one question: the title, the finding in plain words, why
it matters (`explain`), and a menu of the remedy (recommended), skip, and an
own answer. `unknown` means only the owning skill can tell; offer its
hand-off the same way.

- **`handoff`**: invoke `nerdway:<handoff>` and let it run its own steps. It
  asks its own questions. Afterwards rerun `setup-state.ts --check <id>` and
  report the new status in one line.
- **`fix` of kind `config-key`**: show the current value and the
  `suggestion` when there is one. After a yes, run
  `project-config.ts set <key> <value> --layer <layer>`. Write to the layer
  that holds the value today (the project layer when the project config sets
  it), else the check's `layer`. When a finding says an environment variable
  sets the path, still offer the file edit, and say the variable overrides
  the file until it is changed or unset.
- **`fix` of kind `location-strategy`**: ask where the project config should
  live. The menu is `user` (recommended: `<config dir>/<slug>/config.yml`),
  `repo` (`.nerdway/config.yml` in the repository), and an own answer. After
  a yes, run `project-config.ts move --to <choice>`. An existing file is moved,
  never copied. With no file yet, `repo` creates an empty one and `user`
  needs nothing. Report the chosen strategy and the path.
- **`fix` of kind `env-hint`**: explain the variable and its values. Never
  edit a shell profile; the user sets it.

When a step changes something that a later check depends on (a platform
recorded, a CLI installed), rerun the state before the next question.

## Reconfiguration

A request names an area or a key ("change the tracker", "move this project's
config to the repo", "change the global wiki path", or an `id` as argument).
Map it to the one check whose `title`, `area` or `id` matches. Show the
current value from the state, then run only that check's hand-off or fix.
Only the affected keys change, in the file that holds them. Every other key
and comment stays. End with a before/after.

## Key menu (fully configured, no request)

One menu lists every project key as its own option with its current value:
the tracker and VCS with their identifiers, the status binding, the wiki
path when the project config sets it, and the project-config location. The
next option is "global configuration", and the own answer comes last.
"Global configuration" opens a second menu with the global keys and their
current values. Picking a key continues as Reconfiguration.

## Closing summary

End every run with a compact summary:

- what was configured, with a before/after;
- what was skipped, each with the command to come back to it
  (`/nerdway:nerdway-setup <area>`);
- what was already fine.

A run with nothing to fix ends with a short "all set" summary.

## Preflight (for other skills)

A caller about to work (for example `issue-writer` before it files an
issue) runs:

```bash
node "<plugin root>/scripts/setup-state.ts" --preflight --caller <skill> "<dir>"
```

The JSON has these fields:

- `caller`, `status`, `inRepo`, `repoRoot`;
- `projectConfig` (`strategy`, `path`, `exists`);
- `blocking`: the preflight checks that are `missing`;
- `warnings`: the preflight checks that need a look but do not block.

Preflight runs only cheap local probes (git, the config files, the wiki
directory). It never calls the tracker. In this contract a "project" is the
tracker container recorded in the platform config, which is not the same
thing as the repository.

The outcome handed back to the caller is one of these:

- **`ready`**: nothing blocks. Show at most one line (for example "setup
  ready: project config `user` at <path>"). Ask no question; the caller
  continues at once.
- **`undetermined`**: a directory with no repository. Ask, one question per
  turn and in this order:
  1. what this project is;
  2. where it is tracked (tracker and tracker project);
  3. where its sources are kept.

  Hand off to `nerdway:new-project-workflow` when the user wants a fresh
  project set up, and to `nerdway:determine-platform` for the tracker and
  its project. The project config goes to the default `user` location
  without asking for the strategy. Return `configured-now`.
- **`incomplete`**: walk only the `blocking` checks, global ones first, as
  in The walk. Return `configured-now` when all of them were fixed, else
  `incomplete`, naming what the user skipped so the caller can degrade or
  stop with a clear message.

## Related skills

- `nerdway:determine-platform`: records the tracker and VCS.
- `nerdway:bind-statuses`: binds workflow phases to tracker statuses.
- `nerdway:board-setup`: creates missing board statuses.
- `nerdway:bootstrap-clis`: installs the CLIs.
- `nerdway:new-project-workflow`: sets up a fresh project.
- `nerdway:issue-writer`: the first preflight caller.
