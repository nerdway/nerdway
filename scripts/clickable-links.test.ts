import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { findUnlinkedIdentifierViolations } from "./lib/clickable-links.ts";

const root = join(dirname(import.meta.dirname), ".");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const compact = (rel: string) => read(rel).replace(/\s+/g, " ");

const WORKFLOW_SKILLS_REFERENCING_STATUSES = [
  "skills/issue-writer/SKILL.md",
  "skills/issue-workflow/SKILL.md",
  "skills/issue-start/SKILL.md",
  "skills/issue-close/SKILL.md",
  "skills/auto-issue-mode/SKILL.md",
  "skills/project-continue/SKILL.md",
  "skills/retro/SKILL.md",
  "skills/nerd-orchestrate/SKILL.md",
  "skills/nerd-personal-docs/SKILL.md",
] as const;

test("adapters/statuses.md defines the shared Clickable links rule across trackers and channels", () => {
  const statuses = compact("adapters/statuses.md");
  assert.match(statuses, /## Clickable links/);
  assert.match(statuses, /\[label\]\(url\)/);
  assert.match(statuses, /never as a bare identifier next to a separate URL/);
  for (const tracker of ["Linear", "GitHub Issues", "GitLab Issues", "Azure DevOps Boards", "Jira Cloud"]) {
    assert.ok(statuses.includes(tracker), `Clickable links must mention ${tracker}`);
  }
  for (const resource of ["Issue", "Pull / merge request", "Repository", "Commit", "Branch", "File in a repo", "Comment", "Host / service URL", "Vault page"]) {
    assert.ok(statuses.includes(resource), `Clickable links table must include ${resource}`);
  }
  assert.match(statuses, /## Asking the human to move a phase.*\[<ID>\]\(<url>\)/);
});

for (const skillPath of WORKFLOW_SKILLS_REFERENCING_STATUSES) {
  test(`${skillPath} references Clickable links in adapters/statuses.md`, () => {
    const content = compact(skillPath);
    assert.match(content, /adapters\/statuses\.md/);
    assert.match(content, /Clickable links/);
  });
}

test("nerd-personal-docs extends clickable links across all resource kinds and output channels", () => {
  const content = compact("skills/nerd-personal-docs/SKILL.md");
  assert.match(content, /every output outside the guide/);
  assert.match(content, /repository/);
  assert.match(content, /branch/);
  assert.match(content, /tracked file/);
  assert.match(content, /comment/);
  assert.match(content, /host\/service URLs/);
  assert.match(content, /vault pages/);
});

test("nerd-documentation-write enforces clickable links in docs and surrounding channels while banning internal tracker IDs in external prose", () => {
  const content = compact("skills/nerd-documentation-write/SKILL.md");
  assert.match(content, /No internal issue-tracker references in reader-facing prose/);
  assert.match(content, /Clickable Markdown links for every linkable resource/);
  assert.match(content, /\[label\]\(url\)/);
  assert.match(content, /Surrounding output channels/);
});

test("skills do not retain old bare-ID-beside-URL templates", () => {
  assert.equal(
    read("skills/issue-writer/SKILL.md").includes("Issue utworzone (DEMO-123) — w Backlogu: <link>"),
    false,
  );
  assert.equal(
    read("skills/issue-close/SKILL.md").includes("`<child ID>` (`<phase>`): `<child url>`"),
    false,
  );
  assert.match(read("skills/issue-close/SKILL.md"), /\[<child ID>\]\(<child url>\)/);
});

test("findUnlinkedIdentifierViolations accepts clickable Markdown links and valid literal exceptions", () => {
  const cleanOutput = [
    "Issue utworzone: [DEMO-501](https://linear.app/example/issue/DEMO-501) — w Backlogu. Wpisz DEMO-501 w nowej sesji lub wiadomości, aby rozpocząć planowanie.",
    "Merged [PR #43](https://github.com/acme/web/pull/43) ([abc1234](https://github.com/acme/web/commit/abc1234)) into [main](https://github.com/acme/web/tree/main) for [#42](https://github.com/acme/web/issues/42) in [acme/web](https://github.com/acme/web).",
    "GitLab [MR !19](https://gitlab.com/acme/service/-/merge_requests/19) closes [group/project#19](https://gitlab.com/group/project/-/issues/19).",
    "Jira [PROJ-108](https://acme.atlassian.net/browse/PROJ-108) and Azure DevOps [AB#77](https://dev.azure.com/acme/web/_workitems/edit/77) are in review.",
    "Fixes DEMO-501",
    "Refs #42",
    "- 2026-11-25 — DEMO-501 · done · main @ abc1234 — next: none",
  ].join("\n");

  assert.deepEqual(findUnlinkedIdentifierViolations(cleanOutput), []);
});

test("findUnlinkedIdentifierViolations flags bare IDs and bare IDs beside URLs across trackers", () => {
  const badOutputs = [
    "Issue utworzone (DEMO-501) — w Backlogu: https://linear.app/example/issue/DEMO-501",
    "- `DEMO-612` (`backlog`): `https://linear.app/example/issue/DEMO-612`",
    "Covered by DEMO-412: https://linear.app/example/issue/DEMO-412",
    "Merged PR #43 for #42 in acme/web",
    "Closed AB#77 and PROJ-108 without links",
    "See MR !19: https://gitlab.com/acme/service/-/merge_requests/19",
  ];

  for (const sample of badOutputs) {
    const violations = findUnlinkedIdentifierViolations(sample);
    assert.ok(violations.length > 0, `expected violation for: ${sample}`);
  }
});
