export const READINESS_MARKER = "<!-- nerd4rent:pr-body -->";

export type PrBodyState = "draft" | "readiness" | "manual";

const MAGIC_LINE = /^Fixes\s+\S+$/i;
const URL_LINE = /^https?:\/\/\S+$/;

function blocks(body: string): string[][] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter((line) => line.length > 0))
    .filter((lines) => lines.length > 0);
}

export function classifyPrBody(body: string): PrBodyState {
  if (body.includes(READINESS_MARKER)) return "readiness";
  const [first, ...rest] = blocks(body);
  if (first === undefined) return "draft";
  const magicBlock = MAGIC_LINE.test(first[0]) && first.every((line) => MAGIC_LINE.test(line) || URL_LINE.test(line));
  return magicBlock && rest.length <= 1 ? "draft" : "manual";
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
