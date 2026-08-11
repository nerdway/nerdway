---
name: nerdbrain-search
description: >-
  rg-based recipes for searching the nerdbrain Obsidian vault
  (~/obsidian/nerdbrain/5-wiki/) — phrase search, outgoing [[links]]
  extraction, backlinks to a page, and 1-hop graph assembly for an entity
  page. Invoke whenever another skill's recall step needs to search vault
  content, follow wiki links, or build a page's local graph — this is the
  only vault-read path (ADR-0001: filesystem+rg, no CLI abstraction).
---

# nerdbrain-search: rg recipes for the vault

Four recipes against `~/obsidian/nerdbrain/5-wiki/`. All are plain `rg` —
no MCP, no CLI wrapper (ADR-0001). To read a page whose path you already
know (not a search), just `Read` it directly; these recipes are for when
you don't yet know which file(s) you need. The vault gatherer inside
`workflows/plan-context-fanout.js` (the contract's `wiki-recall` node) calls
these same recipes from the workflow island.

## 1. Phrase in vault

Cheap, capped search before opening any file — cast a narrow net first.

```bash
# Filenames only
rg -il "<term>" ~/obsidian/nerdbrain/5-wiki/

# Context snippets, capped
rg -i -n -C2 "<term>" ~/obsidian/nerdbrain/5-wiki/ | head -n 40
```

Review the filenames/snippets before opening anything with `Read`.

## 2. Outgoing `[[links]]` from a page

```bash
rg -o '!?\[\[[^\]]+\]\]' <page>
```

Matches both regular links (`[[slug]]`, `[[slug|alias]]`) and embeds
(`![[slug]]`) — the leading `!` is optional in the pattern. Strip the
brackets and any `|alias` suffix to get the target slug. Run against the
whole file (frontmatter `related:` entries use the same `[[slug]]` syntax,
so one pass covers both frontmatter and body).

## 3. Backlinks to a page

Given a page's `slug`:

```bash
SLUG=<slug>
rg -l '!?\[\['"${SLUG}"'(\|[^\]]*)?\]\]' ~/obsidian/nerdbrain/5-wiki/
```

Accounts for aliased links (`[[slug|alias]]`) and embeds (`![[slug]]`). The
leading `!?` stays single-quoted rather than inside a double-quoted string —
bash's default `histexpand` treats a bare `!` in a double-quoted string as
history expansion and errors out (or, worse, silently empties the variable
it's assigned to, turning the next `rg` into an unfiltered match-everything).
Returns the files that link to `slug`.

## 4. 1-hop graph for an entity page

Compose recipes 2 and 3: outgoing links (frontmatter `related:` + body)
unioned with backlinks.

```bash
PAGE=~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md
SLUG=<slug>

# Outgoing
rg -o '!?\[\[[^\]]+\]\]' "$PAGE"

# Backlinks
rg -l '!?\[\['"${SLUG}"'(\|[^\]]*)?\]\]' ~/obsidian/nerdbrain/5-wiki/
```

Dedupe the two result sets before reading anything further.

## Limits are the caller's job

This skill only supplies *how to search*. Hard limits on *how much to
read* (max related pages per session, reviewing snippets before a full
read) are owned by the calling skill (e.g. `nerdbrain-wiki`'s Graph recall
section) — not duplicated here.
