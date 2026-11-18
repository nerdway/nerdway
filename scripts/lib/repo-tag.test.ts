import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRepoTag, parseRepoTag, repoFromLabels } from "./repo-tag.ts";

test("formats and parses `[repo=owner/name]`", () => {
  assert.equal(formatRepoTag("acme", "app"), "[repo=acme/app]");
  assert.equal(parseRepoTag("[repo=acme/app]"), "acme/app");
  assert.equal(parseRepoTag("[repo=acme/app]  \n"), "acme/app");
  assert.equal(parseRepoTag("[repo=Acme_Org.1/my-app]"), "Acme_Org.1/my-app");
});

test("ignores a tag that is not on its own line", () => {
  assert.equal(parseRepoTag("see [repo=acme/app] in the body"), undefined);
  assert.equal(parseRepoTag("x[repo=acme/app]"), undefined);
  assert.equal(parseRepoTag("[repo=acme/app] trailing text"), undefined);
});

test("takes the first tag only", () => {
  const text = ["intro", "[repo=first/one]", "[repo=second/two]", ""].join("\n");
  assert.equal(parseRepoTag(text), "first/one");
});

test("rejects names with spaces or slashes", () => {
  assert.equal(parseRepoTag("[repo=ac me/app]"), undefined);
  assert.equal(parseRepoTag("[repo=acme/ap p]"), undefined);
  assert.equal(parseRepoTag("[repo=acme/app/extra]"), undefined);
  assert.equal(parseRepoTag("[repo=/app]"), undefined);
  assert.throws(() => formatRepoTag("ac me", "app"), /letters/);
  assert.throws(() => formatRepoTag("acme", "ap/p"), /letters/);
});

test("repoFromLabels reads `repo=owner/name` and the `repo` group", () => {
  assert.equal(repoFromLabels(["bug", "repo=acme/app"]), "acme/app");
  assert.equal(repoFromLabels([{ name: "acme/app", group: "repo" }]), "acme/app");
  assert.equal(repoFromLabels([{ name: "repo=acme/app" }]), "acme/app");
  assert.equal(repoFromLabels([{ name: "acme/app", group: "area" }]), undefined);
  assert.equal(repoFromLabels(["acme/app"]), undefined);
  assert.equal(repoFromLabels([]), undefined);
});
