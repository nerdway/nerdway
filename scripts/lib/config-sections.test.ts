import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasPlatformSection,
  platformPart,
  unknownSectionNotices,
  validateKnownSections,
} from "./config-sections.ts";
import type { PlatformVocabulary } from "../types/platform-config.ts";

const vocabulary: PlatformVocabulary = {
  trackers: ["linear", "github", "none"],
  vcs: ["github", "gitlab"],
  strategies: ["native", "label", "comment"],
  phases: ["backlog", "todo", "in-progress", "in-review", "done"],
};

const context = { vocabulary, trackerAdapter: undefined };

test("platform presence is any platform key, not wiki or pr or an unknown section", () => {
  assert.equal(hasPlatformSection({ wiki: { path: "/v" } }), false);
  assert.equal(hasPlatformSection({ pr: { collapse_details: false } }), false);
  assert.equal(hasPlatformSection({ custom: { a: 1 } }), false);
  assert.equal(hasPlatformSection({ tracker: "github" }), true);
  assert.equal(hasPlatformSection({ github: { owner: "x" } }), true);
});

test("platformPart keeps only registered platform keys", () => {
  assert.deepEqual(platformPart({ tracker: "github", wiki: { path: "/v" }, custom: 1 }), { tracker: "github" });
});

test("unknown sections are notices, never errors", () => {
  const raw = {
    tracker: "github",
    vcs: "github",
    custom: { token: "x" },
  };
  const { errors, notices } = validateKnownSections(raw, context);
  assert.deepEqual(errors, []);
  assert.deepEqual(notices, ["unknown section custom"]);
});

test("unknownSectionNotices can name the file", () => {
  assert.deepEqual(unknownSectionNotices({ extra: 1 }, "config.yml"), ["config.yml: unknown section extra"]);
});
