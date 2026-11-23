import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  commentBodies,
  formatGuideOutcome,
  formatPending,
  latestGuideOutcome,
  parsePending,
  type Pending,
} from "./lib/pending-vault.ts";

// pending-vault.ts list            < comments.json   -> JSON array of complete queue items
// pending-vault.ts outcome         < comments.json   -> JSON of the newest `## Personal guide` outcome
// pending-vault.ts format-guide --path <p> --mode create|update --entity <slug|none> --out <dir> < guide.md
// pending-vault.ts format-checkpoint --page <p> --entry <line> --out <dir>
//   -> writes pending-1.md ... into <dir>, prints one path per line (post each as a comment, in order)
// pending-vault.ts format-outcome verified --path <p> --verification <line>
// pending-vault.ts format-outcome pending --path <p>
// pending-vault.ts format-outcome not-needed --reason <text>
// comments.json: `gh issue view --json comments`, an array of bodies, or an array of `{ body }`.

const EXIT_USAGE = 2;

function fail(message: string): never {
  console.error(`pending-vault: ${message}`);
  process.exit(EXIT_USAGE);
}

function option(args: string[], name: string): string {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (value === undefined || value.trim() === "") fail(`missing ${name}`);
  return value;
}

function stdinJson(): unknown {
  const raw = readFileSync(0, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    fail("stdin is not JSON");
  }
}

function writeParts(item: Pending, out: string): void {
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  formatPending(item).forEach((body, index) => {
    const file = join(dir, `pending-${index + 1}.md`);
    writeFileSync(file, body);
    console.log(file);
  });
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "list":
    console.log(JSON.stringify(parsePending(commentBodies(stdinJson()))));
    break;
  case "outcome":
    console.log(JSON.stringify(latestGuideOutcome(commentBodies(stdinJson()))));
    break;
  case "format-guide": {
    const mode = option(args, "--mode");
    if (mode !== "create" && mode !== "update") fail("--mode must be create or update");
    const entity = option(args, "--entity");
    const text = readFileSync(0, "utf8");
    if (text.trim() === "") fail("the guide text on stdin is empty");
    writeParts({ kind: "guide", path: option(args, "--path"), mode, entityPage: entity === "none" ? null : entity, text }, option(args, "--out"));
    break;
  }
  case "format-checkpoint":
    writeParts({ kind: "checkpoint", page: option(args, "--page"), entry: option(args, "--entry") }, option(args, "--out"));
    break;
  case "format-outcome": {
    const [kind] = args;
    if (kind === "verified") {
      const verification = option(args, "--verification");
      if (!verification.startsWith("verified ")) fail("--verification must be the line verify-vault-file.ts printed");
      process.stdout.write(formatGuideOutcome({ kind, path: option(args, "--path"), verification }));
    } else if (kind === "pending") process.stdout.write(formatGuideOutcome({ kind, path: option(args, "--path") }));
    else if (kind === "not-needed") process.stdout.write(formatGuideOutcome({ kind, reason: option(args, "--reason") }));
    else fail("format-outcome needs verified, pending or not-needed");
    break;
  }
  default:
    fail("usage: pending-vault.ts list|outcome|format-guide|format-checkpoint|format-outcome ...");
}
