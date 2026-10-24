# Vault adapter: filesystem

Selected by tier `file`: the vault directory `~/obsidian/nerdbrain` exists on
this machine, so the vault is plain files, read with `Read` and `rg` and
written with `Edit` and `Write`, identically on desktop and headless server.
The filesystem write is the whole recipe; propagation between machines is
Obsidian Sync, not this adapter's concern.

## Tier

`file` is the default wherever the vault directory exists. The tier probe of
the calling skill checks the directory before anything else, so a connector
that happens to be configured on a machine with the files never wins over
them. Tier `none` (no directory and no connector) selects no adapter: nothing
is read and nothing is written.

## Paths

Absolute paths under the vault root:

```
VAULT=~/obsidian/nerdbrain
PAGE=$VAULT/5-wiki/entities/projects/<slug>.md
INDEX=$VAULT/5-wiki/index.md
LOG=$VAULT/5-wiki/log.md
```

`<slug>` is the entity page slug the SessionStart hook injects. A related
page is the same path with its own slug.

## Operations

| Operation | Recipe | Notes |
|-----------|--------|-------|
| `page.read` | `Read $PAGE` | the hook pre-loads only the always-in-inject sections; read the full page before editing a lazy section |
| `page.read-section` | `Read $PAGE`, take the content under the section's `## ` heading | the file is the page: a section read costs the whole file |
| `page.replace-section` | `Edit $PAGE` | old_string = the section's current content, new_string = the updated content |
| `page.append-section` | `Edit $PAGE` | old_string = the section's last existing line, new_string = that line + the new entry |
| `page.prepend-capped` | `Edit $PAGE` | old_string = the `## Checkpoints` heading + current entries, new_string = heading + new entry + the newest 9 existing entries |
| `page.create` | `Write $PAGE` | content = the filled entity-page-template.md; the file must not exist yet |
| `page.bump-updated` | `Edit $PAGE` | old_string = the frontmatter `updated:` line, new_string = `updated: YYYY-MM-DD` |
| `vault.search` | recipe 1 below | filenames first, then snippets capped at 40 lines |
| `index.append` | `Edit $INDEX` | old_string = the last line under `## Projekty`, new_string = that line + the new `- [[<slug>]] — <one-line description>` line |
| `log.append` | `Edit $LOG` | old_string = the last line of the file, new_string = that line + the new `## [YYYY-MM-DD] entity ...` line |
| `graph.links` | recipe 2 below | one pass over the whole file covers frontmatter `related:` and body |
| `graph.backlinks` | recipe 3 below | aliased links and embeds included |
| `graph.hop1` | recipe 4 below | recipes 2 and 3, deduped |

### Recipe 1: `vault.search`

Filenames only, then context snippets capped at 40 lines:

```bash
rg -il "<term>" ~/obsidian/nerdbrain/5-wiki/

rg -i -n -C2 "<term>" ~/obsidian/nerdbrain/5-wiki/ | head -n 40
```

### Recipe 2: `graph.links`

```bash
rg -o '!?\[\[[^\]]+\]\]' <page>
```

Matches both regular links (`[[slug]]`, `[[slug|alias]]`) and embeds
(`![[slug]]`); the leading `!` is optional in the pattern.

### Recipe 3: `graph.backlinks`

```bash
SLUG=<slug>
rg -l '!?\[\['"${SLUG}"'(\|[^\]]*)?\]\]' ~/obsidian/nerdbrain/5-wiki/
```

### Recipe 4: `graph.hop1`

Outgoing links of the page, then its backlinks:

```bash
PAGE=~/obsidian/nerdbrain/5-wiki/entities/projects/<slug>.md
SLUG=<slug>

rg -o '!?\[\[[^\]]+\]\]' "$PAGE"

rg -l '!?\[\['"${SLUG}"'(\|[^\]]*)?\]\]' ~/obsidian/nerdbrain/5-wiki/
```

## Limits

- The leading `!?` of recipes 3 and 4 stays single-quoted rather than inside a
  double-quoted string: bash's default `histexpand` treats a bare `!` in a
  double-quoted string as history expansion and errors out (or, worse,
  silently empties the variable it is assigned to, turning the next `rg` into
  an unfiltered match-everything).
- `page.read-section` reads the whole file. The caps on how much to read
  (related pages per session, search results before a full read) are the
  calling skill's, not this adapter's.
