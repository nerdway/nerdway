---
name: nerdbrain-search
description: >-
  The four recall operations of the nerdbrain Obsidian vault (5-wiki/): phrase
  search, outgoing [[links]] extraction, backlinks to a page, and 1-hop graph
  assembly for an entity page, each named by its operation ID of the vault
  adapter axis. Invoke whenever another skill's recall step needs to search
  vault content, follow wiki links, or build a page's local graph. The
  transport (filesystem and rg, or a connector) is the recipe of
  adapters/vault/{tier}.md, never of this skill.
---

# nerdbrain-search: the four recall operations

Four operations against `5-wiki/` of the vault. This skill owns what each one
means and how its result is used; how it runs is the recipe of the vault
adapter for the current tier:

```
${CLAUDE_PLUGIN_ROOT}/adapters/vault/<tier>.md
```

If `${CLAUDE_PLUGIN_ROOT}` was not substituted, the plugin root is two
directories up from this skill's base directory.

**Tier probe** (the same steps as `## Tier` of `adapters/vault/mcp.md`): the
directory `~/obsidian/nerdbrain` exists → `file`. Otherwise `ToolSearch` with
the query `+nerdbrain` and `max_results` 1: a result naming a
`mcp__claude_ai_nerdbrain__*` tool → `mcp`; none → `none`. The connector tools
stay deferred: an operation loads only the names it needs
(`select:mcp__claude_ai_nerdbrain__vault_read,...`) right before the call, as
the adapter says. On `none` there is no adapter and no recall.

On tier `mcp` the graph operations (`graph.links`, `graph.backlinks`,
`graph.hop1`) are `—` in the adapter: skip them and add the annotation
`graph recall unavailable on tier mcp` to the result; `vault.search` and
`page.read-section` still run. A missing operation degrades the result, it
never fails the recall.

To read a page whose path you already know (not a search), use the adapter's
`page.read-section`; the operations below are for when you don't yet know
which file(s) you need. The vault gatherer inside
`workflows/plan-context-fanout.js` (the contract's `wiki-recall` node) runs
the same operations from the workflow island, through the adapter path the
island's prompt names.

## 1. `vault.search`: phrase in vault

Cheap, capped search before opening any file; cast a narrow net first. Ask
for filenames first, then for snippets, and review them before opening
anything with `page.read-section`.

## 2. `graph.links`: outgoing `[[links]]` from a page

Returns both regular links (`[[slug]]`, `[[slug|alias]]`) and embeds
(`![[slug]]`). Strip the brackets and any `|alias` suffix to get the target
slug. One pass over the whole page covers frontmatter `related:` and body,
since both use the same `[[slug]]` syntax.

## 3. `graph.backlinks`: backlinks to a page

Given a page's `slug`, returns the files that link to it, aliased links
(`[[slug|alias]]`) and embeds (`![[slug]]`) included.

## 4. `graph.hop1`: 1-hop graph for an entity page

Operations 2 and 3 composed: outgoing links (frontmatter `related:` + body)
unioned with backlinks. Dedupe the two result sets before reading anything
further.

## Limits are the caller's job

This skill only supplies *what to search for*. Hard limits on *how much to
read* (max related pages per session, reviewing snippets before a full
read) are owned by the calling skill (e.g. `nerdbrain-wiki`'s Graph recall
section); the adapter's `## Limits` holds only the gotchas of its transport.
