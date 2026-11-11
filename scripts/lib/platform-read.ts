import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readPlatformConfig } from "./nerdway-config.ts";
import type { PlatformRead, PlatformVocabulary } from "../types/platform-config.ts";

interface Property {
  enum?: string[];
  required?: string[];
  properties?: Record<string, Property>;
}

export function pluginVocabulary(pluginRoot: string): PlatformVocabulary {
  const contract = JSON.parse(readFileSync(join(pluginRoot, "workflow-graph.json"), "utf8")) as {
    schemas: { id: string; schema: Property }[];
  };
  const platform = contract.schemas.find((entry) => entry.id === "PlatformConfig")?.schema.properties ?? {};
  const statuses = platform.statuses?.properties ?? {};
  return {
    trackers: platform.tracker?.enum ?? [],
    vcs: platform.vcs?.enum ?? [],
    strategies: statuses.strategy?.enum ?? [],
    phases: statuses.map?.required ?? [],
  };
}

export function trackerAdapterSources(pluginRoot: string): Map<string, string> {
  const dir = join(pluginRoot, "adapters", "trackers");
  const sources = new Map<string, string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
    sources.set(file.slice(0, -".md".length), readFileSync(join(dir, file), "utf8"));
  }
  return sources;
}

export function readPlatformFile(pluginRoot: string, repoRoot: string, env: NodeJS.ProcessEnv = process.env): PlatformRead {
  return readPlatformConfig(repoRoot, env, {
    vocabulary: pluginVocabulary(pluginRoot),
    trackerAdapters: trackerAdapterSources(pluginRoot),
  });
}
