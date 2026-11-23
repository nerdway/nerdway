/**
 * The pending queue on the issue and the `## Personal guide` outcome lines
 * (ADR-0025). A guide or Checkpoints entry that cannot reach the live wiki is
 * posted on the issue in full, so any workstation session can drain it.
 * Paths are relative to the resolved wiki directory `<WIKI>`.
 */

export const GITHUB_COMMENT_LIMIT = 65536;

export interface PendingGuide {
  kind: "guide";
  path: string;
  mode: "create" | "update";
  entityPage: string | null;
  text: string;
}

export interface PendingCheckpoint {
  kind: "checkpoint";
  page: string;
  entry: string;
}

export type Pending = PendingGuide | PendingCheckpoint;

export type GuideOutcome =
  | { kind: "verified"; path: string; verification: string }
  | { kind: "pending"; path: string }
  | { kind: "not-needed"; reason: string }
  | { kind: "unverified"; path: string }
  | { kind: "none" };

const GUIDE_HEADING = "## Pending guide";
const CHECKPOINT_HEADING = "## Pending checkpoint";
const OUTCOME_HEADING = "## Personal guide";
const PART = /^## Pending guide \(part (\d+)\/(\d+)\)$/;

function normalize(body: string): string {
  return body.replace(/\r\n?/g, "\n");
}

function guideFields(guide: PendingGuide): string {
  return `Path: ${guide.path}\nMode: ${guide.mode}\nEntity page link: ${guide.entityPage ?? "none"}`;
}

/** Format one queue item as one or more comment bodies, each at most `limit` characters. */
export function formatPending(item: Pending, limit: number = GITHUB_COMMENT_LIMIT): string[] {
  if (item.kind === "checkpoint") return [`${CHECKPOINT_HEADING}\n\nPage: ${item.page}\n\n${item.entry}\n`];
  const single = `${GUIDE_HEADING}\n\n${guideFields(item)}\n\n${item.text}`;
  if (single.length <= limit) return [single];

  const head = (index: number, total: number): string =>
    index === 1 ? `${GUIDE_HEADING} (part 1/${total})\n\n${guideFields(item)}\n\n` : `${GUIDE_HEADING} (part ${index}/${total})\n\nPath: ${item.path}\n\n`;
  let total = 2;
  for (;;) {
    const parts: string[] = [];
    let offset = 0;
    for (let index = 1; offset < item.text.length; index++) {
      const room = limit - head(index, total).length;
      if (room <= 0) throw new Error(`comment limit ${limit} is too small for the pending guide header`);
      parts.push(head(index, total) + item.text.slice(offset, offset + room));
      offset += room;
    }
    if (parts.length === total) return parts;
    total = parts.length;
  }
}

function splitHead(body: string): { heading: string; fields: Map<string, string>; rest: string } | null {
  const text = normalize(body);
  const headingEnd = text.indexOf("\n\n");
  if (headingEnd === -1) return null;
  const heading = text.slice(0, headingEnd).trim();
  const afterHeading = text.slice(headingEnd + 2);
  const fieldsEnd = afterHeading.indexOf("\n\n");
  const fieldBlock = fieldsEnd === -1 ? afterHeading : afterHeading.slice(0, fieldsEnd);
  const rest = fieldsEnd === -1 ? "" : afterHeading.slice(fieldsEnd + 2);
  const fields = new Map<string, string>();
  for (const line of fieldBlock.split("\n")) {
    const match = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(line.trim());
    if (match === null) return null;
    fields.set(match[1], match[2].trim());
  }
  return { heading, fields, rest };
}

function guideFrom(fields: Map<string, string>, text: string): PendingGuide | null {
  const path = fields.get("Path");
  const mode = fields.get("Mode");
  const entity = fields.get("Entity page link");
  if (!path || (mode !== "create" && mode !== "update") || entity === undefined) return null;
  return { kind: "guide", path, mode, entityPage: entity === "" || entity === "none" ? null : entity, text };
}

/** Read every complete queue item from the issue's comment bodies (oldest first). */
export function parsePending(bodies: readonly string[]): Pending[] {
  const items: Pending[] = [];
  type Parts = { total: number; chunks: Map<number, string>; fields?: Map<string, string> };
  const parts = new Map<string, Parts>();
  for (const body of bodies) {
    const split = splitHead(body);
    if (split === null) continue;
    const { heading, fields, rest } = split;
    if (heading === CHECKPOINT_HEADING) {
      const page = fields.get("Page");
      const entry = rest.replace(/\n+$/, "");
      if (page && entry) items.push({ kind: "checkpoint", page, entry });
    } else if (heading === GUIDE_HEADING) {
      const guide = guideFrom(fields, rest);
      if (guide !== null) items.push(guide);
    } else {
      const part = PART.exec(heading);
      const path = fields.get("Path");
      if (part === null || !path) continue;
      const total = Number(part[2]);
      const slot: Parts = parts.get(path) ?? { total, chunks: new Map<number, string>() };
      slot.chunks.set(Number(part[1]), rest);
      if (part[1] === "1") slot.fields = fields;
      parts.set(path, slot);
    }
  }
  for (const slot of parts.values()) {
    if (slot.fields === undefined || slot.chunks.size !== slot.total) continue;
    const text = Array.from({ length: slot.total }, (_, index) => slot.chunks.get(index + 1) ?? "").join("");
    const guide = guideFrom(slot.fields, text);
    if (guide !== null) items.push(guide);
  }
  return items;
}

/** Format a `## Personal guide` outcome comment. */
export function formatGuideOutcome(outcome: Exclude<GuideOutcome, { kind: "none" } | { kind: "unverified" }>): string {
  switch (outcome.kind) {
    case "verified":
      return `${OUTCOME_HEADING}\n\nGuide: ${outcome.path}\nVerified: ${outcome.verification}\n`;
    case "pending":
      return `${OUTCOME_HEADING}\n\nPending: ${outcome.path}\n`;
    case "not-needed":
      return `${OUTCOME_HEADING}\n\nNot needed: ${outcome.reason}\n`;
  }
}

function line(lines: string[], key: string): string | undefined {
  const prefix = `${key}:`;
  const found = lines.find((value) => value.startsWith(prefix));
  return found === undefined ? undefined : found.slice(prefix.length).trim();
}

/** Read one comment body as a guide outcome; `none` when it is not a `## Personal guide` comment. */
export function parseGuideOutcome(body: string): GuideOutcome {
  const lines = normalize(body).split("\n").map((value) => value.trim());
  if (lines[0] !== OUTCOME_HEADING) return { kind: "none" };
  const notNeeded = line(lines, "Not needed");
  if (notNeeded) return { kind: "not-needed", reason: notNeeded };
  const pending = line(lines, "Pending");
  if (pending) return { kind: "pending", path: pending };
  const path = line(lines, "Guide");
  if (!path) return { kind: "none" };
  const verification = line(lines, "Verified");
  return verification && verification.startsWith("verified ") ? { kind: "verified", path, verification } : { kind: "unverified", path };
}

/** The outcome of the newest `## Personal guide` comment. */
export function latestGuideOutcome(bodies: readonly string[]): GuideOutcome {
  for (let index = bodies.length - 1; index >= 0; index--) {
    const outcome = parseGuideOutcome(bodies[index]);
    if (outcome.kind !== "none") return outcome;
  }
  return { kind: "none" };
}

/** Comment bodies from a list of strings, of `{ body }` objects, or `{ comments: [...] }` (`gh issue view --json comments`). */
export function commentBodies(input: unknown): string[] {
  const list = Array.isArray(input)
    ? input
    : input !== null && typeof input === "object" && Array.isArray((input as { comments?: unknown }).comments)
      ? (input as { comments: unknown[] }).comments
      : [];
  return list.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (item !== null && typeof item === "object" && typeof (item as { body?: unknown }).body === "string") return [(item as { body: string }).body];
    return [];
  });
}

const CHECKPOINT_OUTCOME_HEADING = "## Checkpoint";

/** Format the `## Checkpoint` comment that answers a drained `## Pending checkpoint`. */
export function formatCheckpointOutcome(outcome: { page: string; verification: string }): string {
  return `${CHECKPOINT_OUTCOME_HEADING}\n\nPage: ${outcome.page}\nVerified: ${outcome.verification}\n`;
}

function verifiedCheckpointPage(body: string): string | undefined {
  const lines = normalize(body).split("\n").map((value) => value.trim());
  if (lines[0] !== CHECKPOINT_OUTCOME_HEADING) return undefined;
  const page = line(lines, "Page");
  const verification = line(lines, "Verified");
  return page && verification?.startsWith("verified ") ? page : undefined;
}

/**
 * The queue items still waiting for the live wiki, oldest first. A guide is
 * open while the newest `## Personal guide` outcome is `Pending:` for its
 * path; a checkpoint is open until a later verified `## Checkpoint` comment
 * names its page.
 */
export function openPending(bodies: readonly string[]): Pending[] {
  const outcome = latestGuideOutcome(bodies);
  const open: Pending[] = [];
  bodies.forEach((body, index) => {
    for (const item of parsePending([body])) {
      if (item.kind === "checkpoint") {
        const answered = bodies.slice(index + 1).some((later) => verifiedCheckpointPage(later) === item.page);
        if (!answered) open.push(item);
      }
    }
  });
  const guides = parsePending(bodies).filter((item): item is PendingGuide => item.kind === "guide");
  const pendingGuide = outcome.kind === "pending" ? guides.filter((item) => item.path === outcome.path).at(-1) : undefined;
  return pendingGuide === undefined ? open : [pendingGuide, ...open];
}
