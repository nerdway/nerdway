# nerd4rent-claude-plugin

Claude Code plugin bundling the skills that run the Nerd4Rent daily developer
workflow: Linear issue lifecycle and the nerdbrain second-brain wiki.

## Language

**Vault**:
The nerdbrain Obsidian vault — a git checkout of `pawelwlazlo/nerdbrain`
present on every machine where wiki skills run.
_Avoid_: notes folder, Obsidian database

**Entity page**:
One English-only markdown page per project at
`5-wiki/entities/projects/<slug>.md` inside the vault; the authoritative
project context injected at session start.
_Avoid_: project note, wiki page (ambiguous)

**Tier**:
The vault-availability signal probed by the SessionStart hook. Reduced to
`file` (vault directory present) or `none` (absent); the historical
REST/CLI tiers are dropped.
_Avoid_: mode, level

**Wiki write**:
One logical wiki mutation — page edit plus index/log upkeep — always
concluded by a git commit and push of the vault.
_Avoid_: page save (hides the git half)

**Graph read**:
On-demand discovery of related vault notes via `[[links]]`, backlinks, and
phrase search, executed with `rg` over the vault files.
_Avoid_: obsidian search (names the dropped tool)
