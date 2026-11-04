# Public history is a filter-repo export into a new repository

The open-source cut of this plugin lives at `nerdway/nerdway`. The private
plugin that Nerd4Rent and its bots run stays in its own repository and is
not rewritten in place. A grilling session on 2026-11-04 settled the split:
two tracks, one public MIT tree and one private operational tree, with
package id `nerdway` on the public side.

**The public repository is produced by cloning a mirror of the private
source, running `git filter-repo` in that throwaway clone (English commit
messages plus the scrub in ADR-0016), and pushing only to
`nerdway/nerdway`.** The private remote is never force-pushed, never given
the rewritten objects, and never used as the destination of an export. Bots
and the private marketplace keep cloning the private remote, unchanged.

Repeating an export uses the same path: a fresh mirror, a fresh rewrite,
push to the public remote only. The private working tree is not a rewrite
workspace. How to run that path is in `docs/DUAL-TRACK.md`.

## Considered Options

- **In-place rewrite of the private repository** (`git filter-repo` on the
  private checkout, then force-push that remote) — rejected: every clone,
  bot, and marketplace install of the private track would have its history
  rewritten under it; a mistake is not recoverable by leaving the private
  remote alone.
- **Squash to one initial commit on the public side** — rejected: the grill
  kept history, rewritten into English, so the public tree still has a
  real commit graph rather than a single blob of "initial import".
- **`git subtree` or a subtree split into the same remote** — rejected: the
  public tree is the whole plugin, not a subdirectory, and a subtree still
  couples the two remotes' object graphs.
- **Mirror clone, `git filter-repo` in a throwaway clone, push only to
  `nerdway/nerdway`** — chosen.

## Consequences

- `nerdway/nerdway` is a distinct GitHub repository. Its `main` is the
  public product; GitHub Issues on that repository is the public tracker
  (ADR-0015).
- Maintainers export and update from the private source with the procedure
  in `docs/DUAL-TRACK.md`. `git filter-repo` drops `origin` after a rewrite;
  the only remote added afterwards is `nerdway/nerdway`.
- A force-with-lease of rewritten history is allowed only on that public
  remote. The private remote is fast-forward only, from its own working
  tree, never from an export clone.
- Changing slash-command prefixes or private-track environment variable
  names is out of scope for the export. Those stay as the private plugin
  ships them until a separate change says otherwise.
