export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

export function satisfiesMinimum(found: string, minimum: string): boolean {
  return compareVersions(found, minimum) >= 0;
}

export function extractVersion(output: string, pattern: string): string | null {
  const match = new RegExp(pattern).exec(output);
  return match?.[1] ?? null;
}
