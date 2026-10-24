# Vault adapter: MCP connector

Selected by tier `mcp`: the vault directory is absent (a Claude Code cloud
session) and the vault is reachable through the `nerdbrain` connector, whose
tools are named `mcp__claude_ai_nerdbrain__*` and sit in front of an Obsidian
instance with the Local REST API; propagation to the other machines is
Obsidian Sync, as on every tier. Every operation is a tool call, nothing is a
file. In the recipes below a bare tool name such as `vault_read` stands for
`mcp__claude_ai_nerdbrain__vault_read`.

## Tier

The probe is the calling skill's, in this order:

1. The directory `~/obsidian/nerdbrain` exists → tier `file`; this adapter is
   not read.
2. Otherwise `ToolSearch` with the query `+nerdbrain` and `max_results` 1. A
   result naming a `mcp__claude_ai_nerdbrain__*` tool → tier `mcp`. No such
   tool → tier `none`: no adapter, no read, no write.

The connector tools stay deferred. An operation loads exactly the names it
needs right before the call, as
`ToolSearch` `select:mcp__claude_ai_nerdbrain__vault_read,mcp__claude_ai_nerdbrain__vault_patch`;
nothing pre-loads the sixteen tools of the connector.

## Paths

Vault-relative paths, without the `~/obsidian/nerdbrain` prefix:

```
PAGE=5-wiki/entities/projects/<slug>.md
INDEX=5-wiki/index.md
LOG=5-wiki/log.md
```

A section is addressed by its **heading path**: the text of the page's H1,
`::`, the section's heading text, as in `nerdbrain-claude-plugin::Decisions`.
The root is the H1 text as `vault_get_document_map` lists it, not the slug
(this plugin's page is `# nerdbrain-claude-plugin` at the slug
`github-com-nerd4rent-nerd4rent-claude-plugin`), so take it from the document
map and never guess it. The root of `index.md` is `Wiki Index`.

## Operations

| Operation | Recipe | Notes |
|-----------|--------|-------|
| `page.read` | `vault_get_document_map {path: PAGE}` | the heading paths, block IDs and frontmatter keys of the page, no content; content comes through `page.read-section`, one section at a time |
| `page.read-section` | `vault_read {path: PAGE, targetType: "heading", target: "<H1>::<Section>"}` | returns the section's markdown alone; `<H1>` from the document map |
| `page.replace-section` | `vault_patch {path: PAGE, targetType: "heading", target: "<H1>::<Section>", operation: "replace", content}` | content without the heading line; the heading stays |
| `page.append-section` | `vault_patch {path: PAGE, targetType: "heading", target: "<H1>::<Section>", operation: "append", content, rejectIfContentPreexists: true}` | the guard makes a retry idempotent |
| `page.prepend-capped` | `page.read-section` of `<H1>::Checkpoints`, then `vault_patch {path: PAGE, targetType: "heading", target: "<H1>::Checkpoints", operation: "replace", content}` with the new entry followed by the newest 9 existing entries | `operation: "prepend"` alone would not enforce the cap of 10 |
| `page.create` | `vault_list {path: "5-wiki/entities/projects/"}` and stop if `<slug>.md` is listed; then `vault_write {path: PAGE, content}` | `vault_write` overwrites without warning, so the listing is the existence check |
| `page.bump-updated` | `vault_patch {path: PAGE, targetType: "frontmatter", target: "updated", operation: "replace", content: "YYYY-MM-DD"}` | |
| `vault.search` | `search_simple {query: "<term>", contextLength: 100}` | Obsidian's full-text search, `{filename, score, matches}` sorted by score; the caller keeps 5 results at most |
| `index.append` | `vault_patch {path: INDEX, targetType: "heading", target: "Wiki Index::Projekty", operation: "append", content, rejectIfContentPreexists: true}` | root `Wiki Index` confirmed with `vault_get_document_map {path: INDEX}` on the first write of a session |
| `log.append` | `vault_append {path: LOG, content}` | end of file |
| `graph.links` | — | not offered on this tier; the caller annotates the result, see `## Limits` |
| `graph.backlinks` | — | as above |
| `graph.hop1` | — | as above |

## Limits

- Never read a whole page. `vault_read` without `target` returns the full
  content plus links and backlinks; on one entity page of this vault that was
  37.4k tokens in a single call. `page.read` is the document map and content
  comes section by section.
- The heading path root is the H1 text, not the slug; a patch with a wrong
  root fails instead of creating the section, which is the safe direction.
- The tools stay deferred: load only the names an operation needs, right
  before the call. The whole connector loaded at once is sixteen schemas in
  context for one write.
- The graph operations are `—` in this version, so a recall on this tier
  skips them and reports `graph recall unavailable on tier mcp` in its result
  rather than failing. `search_query` (JsonLogic over file metadata) and the
  untargeted `vault_read` do expose `links` and `backlinks`, which could serve
  `graph.links` and `graph.backlinks` cheaply; unused in this version.
- Tools deliberately bound to no operation: `active_file_get_path`,
  `open_file`, `command_list`, `command_execute`, `periodic_note_get_path`,
  `tag_list`, `vault_delete`, `vault_move`, `search_query`.
- The connector's access configuration lives in the claude.ai connector
  settings alone; nothing in this repository carries it.
