import { PLACEHOLDER, renderSchema } from "./render-schema.ts";
import type { GraphContract, JsonSchema } from "./workflow-graph.ts";

export interface Template {
  path: string;
  content: string;
}

const BANNER =
  "<!-- GENERATED from the schema registry in workflow-graph.json.\n" +
  "     Run `node scripts/render-templates.ts` to rebuild; editing this file directly reddens the drift test.\n" +
  "     Delete this banner before posting — the body must start with the heading below. -->";

const ISSUE_PREAMBLE = `<!--
  Issue body templates for linear-issue-writer.
  Section names mirror linear-issue-workflow/plan-template.md so the planner
  knows where to look. Use the FULL variant for complex issues, the MINIMAL
  variant for small, clear tasks. Delete the guidance comments before posting.
  Match the language (PL/EN) to the user / repo.
-->`;

const CHILD_NOTE = "<!-- Parent is linked via `linearis issues create --parent-ticket <PARENT-ID>`, not in the body. -->";

function schemaOf(contract: GraphContract, id: string): JsonSchema {
  const entry = contract.schemas.find((schema) => schema.id === id);
  if (entry === undefined) throw new Error(`the schema registry declares no ${id}, so its template cannot be rendered`);
  return entry.schema;
}

function file(blocks: string[]): string {
  return `${blocks.map((block) => block.trimEnd()).join("\n\n")}\n`;
}

export function buildTemplates(contract: GraphContract): Template[] {
  const issueSpec = schemaOf(contract, "IssueSpec");

  return [
    {
      path: "skills/linear-issue-workflow/plan-template.md",
      content: file([BANNER, renderSchema(schemaOf(contract, "ImplementationPlan"), PLACEHOLDER)]),
    },
    {
      path: "skills/linear-issue-writer/issue-template.md",
      content: file([
        BANNER,
        ISSUE_PREAMBLE,
        renderSchema(issueSpec, PLACEHOLDER, { heading: "FULL variant (complex issues)" }),
        "---",
        renderSchema(issueSpec, PLACEHOLDER, { heading: "MINIMAL variant (small, clear tasks)", requiredOnly: true }),
        "---",
        renderSchema(issueSpec, PLACEHOLDER, {
          heading: "CHILD sub-issue (when splitting into stages)",
          requiredOnly: true,
          note: "Each child is a focused slice of the parent. Keep it lean.",
        }),
        CHILD_NOTE,
      ]),
    },
    {
      path: "skills/linear-issue-workflow/session-summary-template.md",
      content: file([BANNER, renderSchema(schemaOf(contract, "SessionSummary"), PLACEHOLDER)]),
    },
  ];
}
