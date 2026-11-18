import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { formatRepoTag } from "./repo-tag.ts";
import { readSection, type SectionIOOptions } from "./config-sections.ts";
import { parseConfig } from "./yaml.ts";

export type SlackConfig = {
  owner?: string;
  channel?: string;
  autonomous: boolean;
};

export type SlackConfigRead =
  | { status: "found"; value: SlackConfig; errors: [] }
  | { status: "absent"; value: undefined; errors: [] }
  | { status: "invalid"; value: undefined; errors: string[] };

export type ChannelLookup =
  | { status: "found"; slug: string }
  | { status: "absent" }
  | { status: "ambiguous"; slugs: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSlack(value: unknown): SlackConfig {
  if (!isRecord(value)) return { autonomous: false };
  return {
    owner: typeof value.owner === "string" ? value.owner : undefined,
    channel: typeof value.channel === "string" ? value.channel : undefined,
    autonomous: value.autonomous === true,
  };
}

export function readSlackConfig(slug: string, options: SectionIOOptions): SlackConfigRead {
  void slug;
  const io = { ...options, gitRemote: options.gitRemote ?? (() => "") };
  const defaults = readSection("slack", { ...io, layer: "defaults" });
  if (defaults.status === "invalid") return defaults;
  const project = readSection("slack", { ...io, layer: "project" });
  if (project.status === "invalid") return project;
  if (defaults.status === "absent" && project.status === "absent") {
    return { status: "absent", value: undefined, errors: [] };
  }
  const fromDefaults = asSlack(defaults.status === "found" ? defaults.value : undefined);
  const fromProject = asSlack(project.status === "found" ? project.value : undefined);
  const projectOwnsAutonomous =
    project.status === "found" && isRecord(project.value) && Object.hasOwn(project.value, "autonomous");
  return {
    status: "found",
    value: {
      owner: fromProject.owner ?? fromDefaults.owner,
      channel: fromProject.channel,
      autonomous: projectOwnsAutonomous ? fromProject.autonomous : fromDefaults.autonomous,
    },
    errors: [],
  };
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function channelOf(config: Record<string, unknown>): string | undefined {
  if (!isRecord(config.slack)) return undefined;
  const channel = config.slack.channel;
  return typeof channel === "string" && channel.length > 0 ? channel : undefined;
}

export function findProjectByChannel(configDir: string, channelId: string): ChannelLookup {
  if (!isDir(configDir)) return { status: "absent" };
  const matches: string[] = [];
  for (const name of readdirSync(configDir).sort()) {
    const dir = join(configDir, name);
    const projectPath = join(dir, "config.yml");
    if (!isDir(dir) || !isFile(projectPath)) continue;
    const parsed = parseConfig(readFileSync(projectPath, "utf8"));
    if (parsed.value === undefined) continue;
    if (channelOf(parsed.value) === channelId) matches.push(name);
  }
  if (matches.length === 0) return { status: "absent" };
  if (matches.length > 1) return { status: "ambiguous", slugs: matches };
  return { status: "found", slug: matches[0] };
}

export function repoTagFromPlatform(platform: unknown): string | undefined {
  if (!isRecord(platform)) return undefined;
  if (platform.vcs === "github" && isRecord(platform.github)) {
    const owner = platform.github.owner;
    const repo = platform.github.repo;
    if (typeof owner === "string" && typeof repo === "string") {
      try {
        formatRepoTag(owner, repo);
        return `${owner}/${repo}`;
      } catch {
        return undefined;
      }
    }
  }
  if (platform.vcs === "gitlab" && isRecord(platform.gitlab)) {
    const group = platform.gitlab.group;
    const project = platform.gitlab.project;
    if (typeof group === "string" && typeof project === "string") return `${group}/${project}`;
  }
  return undefined;
}
