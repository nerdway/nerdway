export type PendingKind = "draft" | "implement" | "question" | "none";

export type ThreadClassification = "approval" | "answer" | "data" | `choice ${number}`;

export type ClassifyThreadReplyInput = {
  authorId?: string;
  ownerId?: string;
  botUserId?: string;
  text: string;
  pending: PendingKind;
};

const YES = /^(tak|yes)$/i;
const NUMBER = /^(\d+)$/;

function normalised(text: string): string {
  return text.trim();
}

export function classifyThreadReply(input: ClassifyThreadReplyInput): ThreadClassification {
  const authorId = input.authorId;
  const ownerId = input.ownerId;
  const botUserId = input.botUserId;
  if (authorId !== undefined && botUserId !== undefined && authorId === botUserId) return "data";
  if (ownerId === undefined || ownerId.length === 0) return "data";
  if (authorId !== ownerId) return "data";

  const text = normalised(input.text);
  const number = NUMBER.exec(text)?.[1];
  const yes = YES.test(text);

  if (input.pending === "question") {
    if (yes || number === "1") return "choice 1";
    if (number !== undefined) return `choice ${Number(number)}`;
    return "answer";
  }

  if (input.pending === "draft" || input.pending === "implement") {
    if (yes || number === "1") return "approval";
    if (number !== undefined) return `choice ${Number(number)}`;
    return "answer";
  }

  if (yes || number !== undefined) return "answer";
  return "answer";
}

export function mayPostInThread(input: { postingUserId?: string; ownerId?: string }): boolean {
  const postingUserId = input.postingUserId;
  if (postingUserId === undefined || postingUserId.length === 0) return false;
  return postingUserId !== input.ownerId;
}
