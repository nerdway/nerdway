export const READINESS_MARKER = "<!-- nerdway:pr-body -->";

export type PrBodyState = "draft" | "readiness" | "manual";

const MAGIC_LINE = /^(?:Fixes|Refs)\s+\S+$/i;
const FIXES_LINE = /^Fixes(\s+\S+)$/i;
const REFS_LINE = /^Refs\s+\S+$/i;
const URL_LINE = /^https?:\/\/\S+$/;

function blocks(body: string): string[][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter((line) => line.length > 0))
    .filter((lines) => lines.length > 0);
}

function isStartParagraph(lines: string[]): boolean {
  const first = lines[0];
  return first !== undefined && !first.startsWith("#") && !first.startsWith("<");
}

export function classifyPrBody(body: string): PrBodyState {
  if (body.includes(READINESS_MARKER)) return "readiness";
  const [first, ...rest] = blocks(body);
  if (first === undefined) return "draft";
  const magicBlock = MAGIC_LINE.test(first[0]) && first.every((line) => MAGIC_LINE.test(line) || URL_LINE.test(line));
  return magicBlock && (rest.length === 0 || (rest.length === 1 && isStartParagraph(rest[0]))) ? "draft" : "manual";
}

export type MagicWord = "fixes" | "refs" | "mixed" | "none";

/** Which magic word the leading magic-word block uses. */
export function magicWord(body: string): MagicWord {
  const [first] = blocks(body);
  if (first === undefined) return "none";
  const words = first.filter((line) => MAGIC_LINE.test(line)).map((line) => (REFS_LINE.test(line) ? "refs" : "fixes"));
  if (words.length === 0 || !MAGIC_LINE.test(first[0])) return "none";
  return words.every((word) => word === words[0]) ? words[0] : "mixed";
}

/**
 * The description with every `Fixes <ID>` line of the leading magic-word block
 * rewritten to the non-closing `Refs <ID>` (a pending guide keeps the issue
 * open at merge). Line endings become `\n`; everything else is unchanged.
 */
export function withRefs(body: string): string {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line === "") {
      if (index === 0) continue;
      break;
    }
    const fixes = FIXES_LINE.exec(line);
    if (fixes !== null) lines[index] = `Refs${fixes[1]}`;
    else if (!MAGIC_LINE.test(line) && !URL_LINE.test(line)) break;
  }
  return lines.join("\n");
}

export function prBodyFromInput(input: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return input;
  }
  if (typeof parsed === "string") return parsed;
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const value = "body" in record ? record.body : record.description;
    return typeof value === "string" ? value : "";
  }
  return input;
}
