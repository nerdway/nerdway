# Dual-track export

nerdway is the public MIT tree. The private plugin and its
bots stay on their own GitHub remote and are not this repository. This
guide is for maintainers who publish or update `nerdway/nerdway` from that
private source.

The public history is a `git filter-repo` rewrite in a throwaway clone,
pushed only to `nerdway/nerdway`. The private remote is never the
destination of an export and is never force-pushed from an export clone.
Decisions behind that path are ADR-0014, ADR-0015, and ADR-0016.

## Tracks

| Track | Remote | Role |
|---|---|---|
| Public | `nerdway/nerdway` | MIT source, GitHub Issues, public marketplace |
| Private | the private plugin remote | bots, private marketplace, internal board |

Bots, sync jobs, and the private marketplace keep using the private remote.
An export does not retarget them.

## Throwaway clone

Work in a directory that is not the private working tree. A mirror clone
keeps the private checkout untouched.

Clone the private source as a mirror. Substitute the private git URL you
already use for that plugin:

```bash
git clone --mirror PRIVATE_SOURCE_URL nerdway-export.git
```

Clone that mirror into a working tree the rewrite will own:

```bash
git clone nerdway-export.git nerdway-rewrite
```

Change into the rewrite clone:

```bash
cd nerdway-rewrite
```

Confirm remotes before installing filter-repo. The rewrite clone may list
the mirror as `origin`; that is still a path back to private objects. After
`git filter-repo` that remote is removed on purpose.

```bash
git remote -v
```

Install [`git-filter-repo`](https://github.com/newren/git-filter-repo) if
it is not on `PATH`.

## History rewrite

Run `git filter-repo` from the rewrite clone, never from the private
working tree. The pass does three things:

1. Replace private strings in file blobs and commit messages (aggressive
   scrub).
2. Rewrite remaining non-English commit subjects into English.
3. Drop AI authorship trailers (`Co-authored-by: Claude`,
   `Co-Authored-By: Cursor`, `Claude-Session`) and map agent author names
   to the copyright holder in [LICENSE](../LICENSE).

The `--replace-text` option reads a replacements file. Keep that file next
to the export clone (it is an operator artifact, not a path this
repository requires). A starting map, in `git-filter-repo` syntax.
Substitute the private org slug from your local replacements file wherever
this guide writes `<private-org>` or `<PRIVATE-ORG>`:

```
regex:NER-==>DEMO-
regex:ner-==>demo-
regex:GRO-==>OPS-
regex:gro-==>ops-
linear.app/<private-org>==>linear.app/example
<private-org>==>nerdway
regex:<PRIVATE-ORG>_==>NERDWAY_
regex:\bProxmox\b==>hypervisor
regex:\bCoder\b==>DevBox
regex:\bpve[0-9]*\b==>host
```

Extend the file with any private filesystem paths, hostnames, or client
slugs the dry-run still finds. Do not add paths that exist only on one
maintainer laptop as required inputs of this guide; put those lines in
your local replacements file.

Rewrite history with that file. The tool removes the `origin` remote when
it finishes, which is what prevents an accidental push of rewritten
objects to the private remote:

```bash
git filter-repo --replace-text replacements.txt
```

A `--message-callback` on the same invocation (or a second filter-repo
pass) translates leftover non-English subjects and strips the trailers
above. Prefer a small callback you maintain next to `replacements.txt`
over pasting a new one from memory each time.

After the rewrite, `git remote -v` must print nothing. Add only the public
remote:

```bash
git remote add public https://github.com/nerdway/nerdway.git
```

If `origin` is still listed, stop. Remove it before any `git push`.

## Export remap

The private plugin keeps its own namespace: slash prefix, env vars, cache
dir, and PR body marker. The public tree uses `nerdway:` / `NERDWAY_` /
`.cache/nerdway` / `<!-- nerdway:pr-body -->`.

The export's `replacements.txt` must map those identifiers before the next
export, or the public scrub-check fails. Minimum extra lines, again with
the private org slug substituted from your local replacements file:

```
<private-org>:==>nerdway:
regex:<PRIVATE-ORG>_==>NERDWAY_
.cache/<private-org>==>.cache/nerdway
<!-- <private-org>:pr-body -->==><!-- nerdway:pr-body -->
```

Also map brand prose (the private org name in sentences and marketplace
copy) to `nerdway`. Coordinate that map on the private side before the
next export; it is not part of this public tree.

## Dry-run

The rewritten clone must not contain the private-track strings, in the tip
or in history. No output and a non-zero exit from `git grep` mean the tree
is clean.

Substitute the private org slug from your local replacements file into the
`<private-org>` token below.

Search the current tree:

```bash
git grep -E 'NER-|GRO-|Proxmox|Coder|pve|<private-org>'
```

Search every commit reachable from the rewrite:

```bash
git grep -E 'NER-|GRO-|Proxmox|Coder|pve|<private-org>' $(git rev-list --all)
```

The same search with ripgrep on the working tree:

```bash
rg -n 'NER-|GRO-|Proxmox|Coder|pve|<private-org>'
```

A hit means the replacements file is incomplete. Fix the file, start again
from a fresh clone of the mirror, and re-run the rewrite. Do not paper over
a hit with a tip-only edit that leaves the string in older commits.

On this public repository, files that document the patterns are allowed to
name them. Run the checker from the repository root; it skips those files
and must still exit 0:

```bash
node scripts/scrub-check.ts
```

## Push

Push only to `nerdway/nerdway`. Force-with-lease is allowed on that public
remote after a full rewrite, because filter-repo changes every object id.

Check remotes one last time. The only fetch/push URL must be
`nerdway/nerdway`:

```bash
git remote -v
```

Push the rewritten `main`:

```bash
git push --force-with-lease public main
```

Push tags the public tree should carry, still to `public` only:

```bash
git push --force-with-lease public --tags
```

Never run `git push --force` or `--force-with-lease` against the private
remote. Never add the private URL as a remote of the rewrite clone "so it
is easier to fetch". Fetch updates through a new mirror instead.

## Repeated exports

Each update is a new throwaway rewrite, not an in-place edit of the last
export directory.

1. Update the mirror (`git fetch` in `nerdway-export.git`).
2. Clone it to a new `nerdway-rewrite` directory.
3. Run the same `git filter-repo` replacements and message callback.
4. Run the dry-run searches. Expect zero hits.
5. Add `public` pointing at `nerdway/nerdway` and push with
   `--force-with-lease`.

Do not run filter-repo inside the private working tree. Do not retarget
bots, marketplace listings, or sync jobs as part of an export.

## Public tracker

GitHub Issues on `nerdway/nerdway` is the public board. Private issues are
not imported. The README must keep pointing at GitHub Issues and must not
gain a private workspace URL.
