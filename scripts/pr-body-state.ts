import { readFileSync } from "node:fs";

import { classifyPrBody, magicWord, prBodyFromInput, withRefs } from "./lib/pr-body.ts";

const USAGE = `usage: <pr.view command> | node scripts/pr-body-state.ts [--magic | --refs]
stdin holds the PR/MR description, raw or as the JSON pr.view prints (field body or description)
prints draft, readiness or manual;
--magic prints the magic word of the leading block: fixes, refs, mixed or none;
--refs prints the description with each leading Fixes <ID> line switched to Refs <ID>`;

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--magic" && args[0] !== "--refs")) {
  console.error(USAGE);
  process.exit(2);
}

const body = prBodyFromInput(readFileSync(0, "utf8"));
if (args[0] === "--magic") console.log(magicWord(body));
else if (args[0] === "--refs") process.stdout.write(withRefs(body));
else console.log(classifyPrBody(body));
