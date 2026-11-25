export interface UnlinkedIdentifierViolation {
  line: number;
  kind: "paired-id-and-url" | "bare-identifier";
  match: string;
}

const FENCE_RE = /^\s*(```|~~~)/;
const MAGIC_LINE_RE = /^(?:Fixes|Refs)\s+(?:[A-Z]{2,10}-\d+|(?:[\w.-]+\/[\w.-]+)?#\d+|AB#\d+)\b/;
const CHECKPOINT_LINE_RE = /^-\s+\d{4}-\d{2}-\d{2}\s+—\s+\S+\s+·\s+/;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\([^)\s]+\)/g;
const INLINE_CODE_RE = /`[^`]+`/g;
const SKILL_COMMAND_ID_RE = /(?:\/?nerdway:[a-z0-9-]+|Wpisz)\s+(?:[A-Z]{2,10}-\d+|AB#\d+|(?:[\w.-]+\/[\w.-]+)?#\d+)/g;

const PAIRED_PATTERNS: RegExp[] = [
  /(?:`?[A-Z]{2,10}-\d+`?|`?AB#\d+`?|`?(?:[\w.-]+\/[\w.-]+)?#\d+`?|`?PR\s+#\d+`?|`?MR\s+!\d+`?)(?:\s*\([^)\n]+\))?\s*(?:[:—–-]\s*|\s+w\s+\S+\s*:\s*)\s*`?https?:\/\/\S+`?/g,
  /(?:`?[A-Z]{2,10}-\d+`?|`?AB#\d+`?|`?(?:[\w.-]+\/[\w.-]+)?#\d+`?|`?PR\s+#\d+`?|`?MR\s+!\d+`?)\s*\(`?https?:\/\/[^)\s]+`?\)/g,
];

const BARE_ID_PATTERNS: RegExp[] = [
  /\b[A-Z]{2,10}-\d+\b/g,
  /\bAB#\d+\b/g,
  /\b(?:PR\s+#\d+|MR\s+!\d+)\b/g,
  /(?<![\w/])(?:[\w.-]+\/[\w.-]+)?#\d+\b/g,
];

function stripMarkdownLinks(line: string): string {
  return line.replace(MARKDOWN_LINK_RE, " ");
}

function stripAllowedLiteralIds(line: string): string {
  return line.replace(SKILL_COMMAND_ID_RE, " ").replace(INLINE_CODE_RE, " ");
}

export function findUnlinkedIdentifierViolations(text: string): UnlinkedIdentifierViolation[] {
  const violations: UnlinkedIdentifierViolation[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let fenced = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (FENCE_RE.test(rawLine)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const trimmed = rawLine.trim();
    if (!trimmed || MAGIC_LINE_RE.test(trimmed) || CHECKPOINT_LINE_RE.test(trimmed)) continue;

    const withoutLinks = stripMarkdownLinks(rawLine);
    let pairedMatched = false;
    for (const pattern of PAIRED_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(withoutLinks)) !== null) {
        pairedMatched = true;
        violations.push({
          line: i + 1,
          kind: "paired-id-and-url",
          match: match[0].trim(),
        });
      }
    }
    if (pairedMatched) continue;

    const prose = stripAllowedLiteralIds(withoutLinks);
    for (const pattern of BARE_ID_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(prose)) !== null) {
        violations.push({
          line: i + 1,
          kind: "bare-identifier",
          match: match[0].trim(),
        });
      }
    }
  }

  return violations;
}
