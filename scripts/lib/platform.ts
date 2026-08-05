import { PLATFORM_KEYS, type PlatformKey } from "../types/cli-dependencies.ts";

export function platformKey(platform: string, arch: string): PlatformKey | null {
  const candidate = `${platform}-${arch}`;
  return (PLATFORM_KEYS as readonly string[]).includes(candidate) ? (candidate as PlatformKey) : null;
}
