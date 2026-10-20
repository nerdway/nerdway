export interface RunArgs {
  skills: string[];
  dryRun: boolean;
  keepCases: boolean;
  help: boolean;
  passthrough: string[];
}

export interface RunArgsError {
  error: string;
}

const REFUSED_FLAGS = new Map([
  ["--eval-dir", "the runner writes its own eval dir; do not pass --eval-dir"],
  ["--scaffold", "scaffold scripts run bash as you; the converted cases have none, so --scaffold is refused"],
  ["--allow-real-servers", "evals must not reach a real tracker or VCS host; --allow-real-servers is refused"],
]);

const GATED_TOOL = /^(Bash|mcp__)/;

function splitFlag(arg: string): [string, string | undefined] {
  const at = arg.indexOf("=");
  return arg.startsWith("--") && at !== -1 ? [arg.slice(0, at), arg.slice(at + 1)] : [arg, undefined];
}

export function parseRunArgs(argv: string[]): RunArgs | RunArgsError {
  const parsed: RunArgs = { skills: [], dryRun: false, keepCases: false, help: false, passthrough: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill") {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("-")) return { error: "--skill needs a skill name" };
      parsed.skills.push(...value.split(",").filter((name) => name.length > 0));
      continue;
    }
    if (flag === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (flag === "--keep-cases") {
      parsed.keepCases = true;
      continue;
    }
    if (flag === "--help" || flag === "-h") {
      parsed.help = true;
      continue;
    }
    const refused = REFUSED_FLAGS.get(flag);
    if (refused !== undefined) return { error: refused };
    if (flag === "--mocks" && (inline ?? argv[i + 1]) === "off") {
      return { error: "evals must not reach a real tracker or VCS host; --mocks off is refused" };
    }
    if (flag === "--allow-tools") {
      const tools = inline !== undefined ? [inline] : argv.slice(i + 1, nextFlag(argv, i + 1));
      if (tools.some((tool) => GATED_TOOL.test(tool))) {
        return { error: "evals must not reach a real tracker or VCS host; granting Bash or MCP tools is refused" };
      }
    }
    parsed.passthrough.push(argv[i]);
  }
  return parsed;
}

function nextFlag(argv: string[], from: number): number {
  const at = argv.findIndex((arg, index) => index >= from && arg.startsWith("-"));
  return at === -1 ? argv.length : at;
}

export interface ClaudeInvocation {
  root: string;
  evalDir: string;
  outputDir: string;
  passthrough: string[];
}

export function claudeArgs({ root, evalDir, outputDir, passthrough }: ClaudeInvocation): string[] {
  const hasOutputDir = passthrough.some((arg) => splitFlag(arg)[0] === "--output-dir");
  return ["plugin", "eval", root, "--eval-dir", evalDir, ...(hasOutputDir ? [] : ["--output-dir", outputDir]), ...passthrough];
}
