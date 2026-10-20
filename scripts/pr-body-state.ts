import { readFileSync } from "node:fs";

import { classifyPrBody, prBodyFromInput } from "./lib/pr-body.ts";

const USAGE = `usage: <pr.view command> | node scripts/pr-body-state.ts
stdin holds the PR/MR description, raw or as the JSON pr.view prints (field body or description)
prints draft, readiness or manual`;

if (process.argv.length > 2) {
  console.error(USAGE);
  process.exit(2);
}

console.log(classifyPrBody(prBodyFromInput(readFileSync(0, "utf8"))));
