import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyThreadReply, mayPostInThread } from "./slack-approval.ts";

const owner = "U0123456789";
const reporter = "U9876543210";
const bot = "U1111111111";

test("the owner's yes approves a pending draft", () => {
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "yes", pending: "draft" }),
    "approval",
  );
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "Yes", pending: "implement" }),
    "approval",
  );
});

test("tak and 1 approve too", () => {
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "tak", pending: "draft" }),
    "approval",
  );
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "1", pending: "implement" }),
    "approval",
  );
});

test("anyone else's yes is data", () => {
  assert.equal(
    classifyThreadReply({ authorId: reporter, ownerId: owner, botUserId: bot, text: "yes", pending: "draft" }),
    "data",
  );
  assert.equal(
    classifyThreadReply({ authorId: reporter, ownerId: owner, botUserId: bot, text: "1", pending: "implement" }),
    "data",
  );
});

test("no configured owner means nothing is an approval", () => {
  assert.equal(
    classifyThreadReply({ authorId: owner, botUserId: bot, text: "yes", pending: "draft" }),
    "data",
  );
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: "", botUserId: bot, text: "tak", pending: "implement" }),
    "data",
  );
});

test("the bot's own message is data", () => {
  assert.equal(
    classifyThreadReply({ authorId: bot, ownerId: owner, botUserId: bot, text: "yes", pending: "draft" }),
    "data",
  );
});

test("under a question, the owner's number picks that option and free text is an answer", () => {
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "2", pending: "question" }),
    "choice 2",
  );
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "1", pending: "question" }),
    "choice 1",
  );
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "yes", pending: "question" }),
    "choice 1",
  );
  assert.equal(
    classifyThreadReply({ authorId: owner, ownerId: owner, botUserId: bot, text: "ship it tomorrow", pending: "question" }),
    "answer",
  );
});

test("mayPostInThread refuses the owner's identity and an unknown identity", () => {
  assert.equal(mayPostInThread({ postingUserId: owner, ownerId: owner }), false);
  assert.equal(mayPostInThread({ ownerId: owner }), false);
  assert.equal(mayPostInThread({ postingUserId: "", ownerId: owner }), false);
  assert.equal(mayPostInThread({ postingUserId: bot, ownerId: owner }), true);
});
