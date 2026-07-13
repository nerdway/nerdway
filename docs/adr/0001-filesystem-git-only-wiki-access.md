# Filesystem + git as the only wiki access path

The nerdbrain vault must be manageable from headless remote servers, where no
Obsidian app, REST API, or `obsidian` CLI exists — and the official Obsidian
CLI (v1.12+) only remote-controls a running desktop app, while Obsidian
Headless is a Sync-only client (and Obsidian Sync is not used here). We
therefore drop the obsidian CLI/REST abstraction entirely: all wiki writes go
through the plain filesystem (`Read`/`Edit`/`Write`), all search and graph
reads go through `rg`, and this applies uniformly on every machine — desktop
included — so there is exactly one recipe to maintain. The hook's tier probe
collapses from `rest|rest-http|cli|file|none` to `file|none`.

## Considered Options

- Keep REST/CLI preferred on desktop with filesystem as a server-only path —
  rejected: two parallel write paths to maintain for no functional gain
  (Obsidian reloads from disk anyway).
- Obsidian Headless for server access — rejected: it only syncs via Obsidian
  Sync, offers no note read/write commands, and Obsidian Sync is not used.

## Consequences

- Every wiki write ends with `git commit` + `git push` of the vault
  (see ADR-0002).
- The existing MCP/REST prohibition becomes moot but stays as a hard rule.
