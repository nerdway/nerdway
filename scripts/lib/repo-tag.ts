export const REPO_TAG = /^\[repo=([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\]\s*$/m;

const NAME = /^[A-Za-z0-9_.-]+$/;

export type RepoLabel = string | { name: string; group?: string };

function tagged(owner: string, name: string): string {
  return `${owner}/${name}`;
}

function fromGroups(owner: string | undefined, name: string | undefined): string | undefined {
  if (owner === undefined || name === undefined) return undefined;
  if (!NAME.test(owner) || !NAME.test(name)) return undefined;
  return tagged(owner, name);
}

export function formatRepoTag(owner: string, name: string): string {
  if (!NAME.test(owner) || !NAME.test(name)) {
    throw new Error("repository owner and name may hold only letters, digits, underscore, dot and hyphen");
  }
  return `[repo=${owner}/${name}]`;
}

export function parseRepoTag(text: string): string | undefined {
  const match = REPO_TAG.exec(text);
  if (match === null) return undefined;
  return fromGroups(match[1], match[2]);
}

function parseOwnerName(value: string): string | undefined {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value.trim());
  if (match === null) return undefined;
  return fromGroups(match[1], match[2]);
}

function parseEqualsTag(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("repo=")) return undefined;
  return parseRepoTag(`[${trimmed}]`);
}

export function repoFromLabels(labels: readonly RepoLabel[]): string | undefined {
  for (const label of labels) {
    if (typeof label === "string") {
      const fromEquals = parseEqualsTag(label);
      if (fromEquals !== undefined) return fromEquals;
      continue;
    }
    const fromEquals = parseEqualsTag(label.name);
    if (fromEquals !== undefined) return fromEquals;
    if (label.group === "repo") {
      const fromName = parseOwnerName(label.name);
      if (fromName !== undefined) return fromName;
    }
  }
  return undefined;
}
