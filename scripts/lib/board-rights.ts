export type Right = "yes" | "no" | "unknown";
export type Level = "native" | "label" | "comment";

export interface BoardRights {
  native: Right;
  label: Right;
  reason: string;
}

export interface LevelDecision {
  level: Level;
  reason: string;
  uncertain: boolean;
}

const ORDER: readonly Level[] = ["native", "label", "comment"];

function rightFor(level: Level, rights: BoardRights): Right {
  if (level === "comment") return "yes";
  return rights[level];
}

export function dropLevel(level: Level): Level {
  if (level === "native") return "label";
  return "comment";
}

export function decideLevel(rights: BoardRights, floor: Level = "native"): LevelDecision {
  const start = ORDER.indexOf(floor);
  for (const level of ORDER.slice(start)) {
    const right = rightFor(level, rights);
    if (right === "yes") return { level, reason: rights.reason, uncertain: false };
    if (right === "unknown") return { level, reason: rights.reason, uncertain: true };
  }
  return { level: "comment", reason: rights.reason, uncertain: false };
}
