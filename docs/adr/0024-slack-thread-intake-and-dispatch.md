# Slack thread intake and dispatch

*2026-11-18.*

#28 adds a **chat host** path that runs the issue lifecycle from a
project Slack channel, and a `dispatch` node that picks the executor
after the owner's approval. The hosts axis already answers where the
agent asks the human and how they answer. A Slack thread changes
exactly that: questions go out as thread replies, answers come in as
replies, and only one person's replies count.

**A Slack channel message is classified as issue or chat. An issue is
grilled and drafted in that message's thread and filed only after the
configured owner approves the draft there. Once the owner approves
implementation, a deterministic `dispatch` step emits a dispatch
decision: a Cursor cloud agent, local Claude Code, or the chat host
itself. Review, the user's guide and close-out stay with the chat
host. The pilot merges by hand.**

The posting identity is a dedicated Slack app (bot user). nerdway does
not ship a Slack transport, tokens or a channel listener: those are
user setup. `mayPostInThread` refuses the owner's identity and an
unknown one, so the adapter never posts with the owner's user token.

The **repo tag** (`[repo=owner/name]` on the issue, or a label named
`owner/name` in a `repo` group) is the only source a cloud executor
uses to pick the repository. GitLab, Azure DevOps, local and hardware
work, and a GitHub issue with no tag never route to a cloud agent.

## Considered Options

- **Keep Slack as Grok Bot `SendToUser`** — rejected: that tool reaches
  the owner's private chat, not the project thread, and every reply in
  the channel would look like chat.
- **A Slack transport in this plugin** — rejected: tokens and the
  listener belong to the user's Slack app. This change decides what to
  post and whose reply counts.
- **A host field on platform config** — rejected: the host is a
  property of the running session, same as ADR-0012.
- **Autonomous merge in the same change** — rejected: the pilot merges
  by hand. `slack.autonomous` defaults to false and also needs the
  `autonomous` label.
- **A `slack-thread` host, a built-in `slack` section, owner approval
  in the thread, and a `dispatch` node** — chosen.

## Consequences

- `Host.id` gains `slack-thread`. `detectHost` takes `slackThread` and
  that match wins after an explicit env key and before the tool probes.
- `workflow-graph.json` gains a `dispatch` node and a
  `DispatchDecision` schema. `implement` takes that payload as input.
  Choosing writes nothing; the launch stays in `implement`.
- Frozen rule `no-tracker-write-before-approval` and the
  `issue-write` / `plan-draft` / `implement` gates spell out that in a
  Slack thread, chat means the replies of the configured owner's Slack
  user ID only.
- `slack-intake` is the skill the channel event runs. Grill Slack
  rendering lives in `skills/grill/reference.md` and the adapter;
  `skills/grill/SKILL.md` is unchanged.
- `IssueSpec.repo` renders as a `### Repository` section in the FULL
  issue template. MINIMAL and CHILD stay as they are; issue-writer
  adds the tag line to any variant when the repo is known.
