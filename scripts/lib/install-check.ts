import { compareVersions } from "./version.ts";

export type VersionDrift = { kind: "version-drift"; installed: string; main: string };

export function detectVersionDrift(installed: string, main: string | null): VersionDrift | null {
  if (main === null || compareVersions(installed, main) >= 0) return null;
  return { kind: "version-drift", installed, main };
}
