import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { HOST_IDS, type HostId } from "./lib/host-detect.ts";
import { detectMachine } from "./lib/workstation.ts";

// verify-vault-file.ts <wiki> <path> --contains <url> [--host <id>]
// Exit 0: the file is in the live wiki, non-empty and contains <url>; prints
//   `verified <path> <bytes> bytes sha256:<12 hex> on <machine> <YYYY-MM-DD>`.
// Exit 1: the file is missing, empty or lacks <url>.
// Exit 2: usage error or a path outside <wiki>.
// Exit 3: this session is not on a workstation, so <wiki> is not the live wiki.

const EXIT_NOT_VERIFIED = 1;
const EXIT_USAGE = 2;
const EXIT_NOT_LIVE = 3;

function fail(code: number, message: string): never {
  console.error(`verify-vault-file: ${message}`);
  process.exit(code);
}

function argument(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

const args = process.argv.slice(2);
const contains = argument(args, "--contains");
const hostArg = argument(args, "--host");
const valued = new Set(["--contains", "--host"]);
const [wikiArg, pathArg] = args.filter((arg, index) => !valued.has(arg) && !valued.has(args[index - 1] ?? ""));

if (wikiArg === undefined || pathArg === undefined || contains === undefined || contains.trim() === "") {
  fail(EXIT_USAGE, "usage: verify-vault-file.ts <wiki> <path> --contains <url> [--host <id>]");
}
if (hostArg !== undefined && !(HOST_IDS as readonly string[]).includes(hostArg)) fail(EXIT_USAGE, `unknown host "${hostArg}"`);

const wiki = resolve(wikiArg);
const file = isAbsolute(pathArg) ? resolve(pathArg) : resolve(wiki, pathArg);
const shown = relative(wiki, file);
if (shown === "" || shown.startsWith("..") || isAbsolute(shown)) fail(EXIT_USAGE, `${pathArg} is outside ${wiki}`);

const machine = detectMachine({ env: process.env, host: hostArg as HostId | undefined });
if (machine.kind !== "workstation") {
  fail(EXIT_NOT_LIVE, `${wiki} is not the live wiki: this session runs on a remote machine (${machine.reason})`);
}
if (!existsSync(wiki) || !statSync(wiki).isDirectory()) fail(EXIT_NOT_LIVE, `${wiki} is not the live wiki: the directory does not exist`);

const label = shown.split(sep).join("/");
if (!existsSync(file) || !statSync(file).isFile()) fail(EXIT_NOT_VERIFIED, `${label} does not exist`);
const bytes = readFileSync(file);
if (bytes.length === 0) fail(EXIT_NOT_VERIFIED, `${label} is empty`);
if (!bytes.toString("utf8").includes(contains)) fail(EXIT_NOT_VERIFIED, `${label} does not contain ${contains}`);

const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
const date = new Date().toLocaleDateString("sv-SE");
console.log(`verified ${label} ${bytes.length} bytes sha256:${digest} on ${hostname()} ${date}`);
