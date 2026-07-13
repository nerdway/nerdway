# Git as the vault sync backbone for wiki writes

Remote servers get the vault as a git checkout of `pawelwlazlo/nerdbrain`
(no syncthing there), so server-side wiki writes must publish themselves.
We adopt one uniform protocol on every tier, desktop included: `git pull
--rebase` before the first wiki write of a session, then `git commit` +
`git push` after each logical wiki write (page + index/log together). A
rebase conflict stops wiki writes and is surfaced to the user, mirroring
the existing syncthing sync-conflict guard.

## Consequences

- The desktop vault stops accumulating uncommitted changes for wiki files;
  the current ~776-file dirty tree must be cleaned up as a prerequisite.
- Syncthing remains for desktop-to-desktop sync of the wider vault; git is
  the authoritative channel for wiki writes.
