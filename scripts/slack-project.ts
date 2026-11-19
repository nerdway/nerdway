import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

import { readSection } from "./lib/config-sections.ts";
import { resolveConfigDir } from "./lib/config-location.ts";
import { pluginVocabulary, trackerAdapterSources } from "./lib/platform-read.ts";
import { findProjectByChannel, readSlackConfig, repoTagFromPlatform } from "./lib/slack-config.ts";

const EXIT_FOUND = 0;
const EXIT_USAGE = 1;
const EXIT_ABSENT = 3;
const EXIT_INVALID = 4;

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(status: number, message: string): never {
  console.error(message);
  process.exit(status);
}

const channelId = process.argv[2]?.trim();
if (channelId === undefined || channelId.length === 0) {
  fail(EXIT_USAGE, "usage: node scripts/slack-project.ts <channelId>");
}

const env = process.env;
const configDir = resolveConfigDir(env, process.platform, homedir());
const found = findProjectByChannel(configDir, channelId);
if (found.status === "absent") {
  fail(EXIT_ABSENT, `no project claims channel ${channelId}`);
}
if (found.status === "ambiguous") {
  fail(EXIT_INVALID, `channel ${channelId} is claimed by ${found.slugs.join(" and ")}`);
}

const io = {
  repoRoot: join(configDir, found.slug),
  env: { ...env, NERDWAY_CONFIG_DIR: configDir },
  gitRemote: () => "",
  vocabulary: pluginVocabulary(pluginRoot),
  trackerAdapters: trackerAdapterSources(pluginRoot),
};

const slack = readSlackConfig(found.slug, io);
if (slack.status === "invalid") fail(EXIT_INVALID, slack.errors.join("\n"));

const platform = readSection("platform", io);
if (platform.status === "invalid") fail(EXIT_INVALID, platform.errors.join("\n"));
const platformValue = platform.status === "found" ? platform.value : undefined;

const body: Record<string, unknown> = {
  slug: found.slug,
  platform: platformValue ?? {},
  owner: slack.status === "found" ? slack.value.owner ?? null : null,
  autonomous: slack.status === "found" ? slack.value.autonomous : false,
  repoTag: repoTagFromPlatform(platformValue) ?? null,
};

console.log(JSON.stringify(body));
process.exit(EXIT_FOUND);
