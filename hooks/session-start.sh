#!/usr/bin/env bash
set -u
umask 077

VAULT="${NERDBRAIN_VAULT:-$HOME/obsidian/nerdbrain}"
ALIASES="${NERDBRAIN_ALIASES:-$HOME/.claude/nerdbrain.aliases}"
KILL_SWITCH="$HOME/.claude/nerdbrain.disabled"
INJECT_BUDGET="${NERDBRAIN_INJECT_BUDGET:-8192}"

_hook_input=$(cat)

_project_dir() {
  python3 -c '
import json, os, sys
raw = sys.argv[1]
try:
    data = json.loads(raw) if raw.strip() else {}
except json.JSONDecodeError:
    data = {}
roots = data.get("workspace_roots") or []
if isinstance(roots, list) and roots and isinstance(roots[0], str) and roots[0]:
    print(roots[0])
else:
    print(os.getcwd())
' "$_hook_input"
}

PROJECT_DIR=$(_project_dir)
PROJECTS_DIR="$VAULT/5-wiki/entities/projects"

_resolve_slug() {
  if [ -f "$PROJECT_DIR/.nerdbrain-slug" ]; then
    head -n1 "$PROJECT_DIR/.nerdbrain-slug" | tr -cd 'a-z0-9-' | head -c 200
    return
  fi

  local url
  url=$(git -C "$PROJECT_DIR" config --get remote.origin.url 2>/dev/null || true)
  if [ -n "$url" ]; then
    local cleaned
    cleaned=$(printf '%s' "$url" \
              | sed -E 's|^git@||; s|^https?://||; s|:|/|; s|\.git$||')
    if [ -f "$ALIASES" ]; then
      local host al
      host="${cleaned%%/*}"
      al=$(grep -E "^${host}=" "$ALIASES" 2>/dev/null \
           | head -n1 | cut -d= -f2 | tr -cd 'a-z0-9-')
      [ -n "$al" ] && cleaned="$al/${cleaned#*/}"
    fi
    printf '%s' "$cleaned" | tr '/.' '--' | tr '[:upper:]' '[:lower:]'
    return
  fi

  basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-'
}

_probe_tier() {
  [ -d "$VAULT" ] && echo file || echo none
}

_json_out() {
  python3 -c '
import json, sys
print(json.dumps({"additional_context": sys.argv[1]}))
' "${1:-}"
}

_read_page() {
  local slug="$1"
  local page_path="$VAULT/5-wiki/entities/projects/$slug.md"
  if [ -f "$page_path" ]; then
    cat "$page_path"
  fi
  return 0
}

_trim_page() {
  python3 -c '
import sys

ALWAYS = {"Purpose", "Stack", "Commands", "Conventions", "Active context"}
path = sys.argv[1]

cur_head, cur, blocks = None, [], []
for line in sys.stdin.read().splitlines(keepends=True):
    if line.startswith("## "):
        blocks.append((cur_head, cur))
        cur_head, cur = line[3:].strip(), [line]
    else:
        cur.append(line)
blocks.append((cur_head, cur))

kept, omitted = [], []
for head, block in blocks:
    if head is None or head in ALWAYS:
        kept.extend(block)
    else:
        omitted.append(head)

out = "".join(kept).rstrip("\n") + "\n"
if omitted:
    out += ("\n[omitted: " + ", ".join(omitted) + " — read " + path
            + " before debugging or when a decision\x27s rationale matters]\n")
sys.stdout.write(out)
' "$1"
}

_enforce_budget() {
  python3 -c '
import sys

budget, path = int(sys.argv[1]), sys.argv[2]
data = sys.stdin.read()
raw = data.encode()
if len(raw) <= budget:
    sys.stdout.write(data)
    sys.exit(0)
marker = "\n[truncated — read full page: %s]\n" % path
cut = max(0, budget - len(marker.encode()))
sys.stdout.write(raw[:cut].decode("utf-8", errors="ignore") + marker)
' "$1" "$2"
}

[[ "${BASH_SOURCE[0]}" != "${0}" ]] && return 0

if [ -f "$KILL_SWITCH" ] || [ -f "$PROJECT_DIR/.nerdbrain-disabled" ]; then
  _json_out ""
  exit 0
fi

if [ -d "$VAULT" ]; then
  cwd_real=$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P)
  vault_real=$(cd "$VAULT" 2>/dev/null && pwd -P)
  case "$cwd_real/" in
    "$vault_real"/*) _json_out ""; exit 0 ;;
  esac
fi

SLUG=$(_resolve_slug)
TIER=$(_probe_tier)

PAGE_PATH="$PROJECTS_DIR/$SLUG.md"
PAGE_CONTENT=$(_read_page "$SLUG" 2>/dev/null || true)
if [ -n "$PAGE_CONTENT" ]; then
  PAGE_CONTENT=$(_trim_page "$PAGE_PATH" <<<"$PAGE_CONTENT")
fi

CTX=""
CTX+="## Nerdbrain second brain — session context"$'\n\n'
CTX+="slug: \`$SLUG\`"$'\n'
CTX+="tier: \`$TIER\`"$'\n'
CTX+=$'\n'
if [ -n "$PAGE_CONTENT" ]; then
  CTX+="## Project page from nerdbrain wiki"$'\n\n'
  CTX+="$PAGE_CONTENT"$'\n\n'
  CTX+="_Path: \`5-wiki/entities/projects/$SLUG.md\`. To update it, follow the write triggers in user rules / AGENTS.md / CLAUDE.md and invoke the \`nerdbrain-wiki\` skill for the procedure._"$'\n'
else
  CTX+="## Project not yet in nerdbrain wiki"$'\n\n'
  CTX+="No page at \`5-wiki/entities/projects/$SLUG.md\` yet. Build understanding during the session and, when a write trigger fires (see user rules / AGENTS.md / CLAUDE.md), invoke the \`nerdbrain-wiki\` skill to create it."$'\n'
fi

CTX=$(_enforce_budget "$INJECT_BUDGET" "$PAGE_PATH" <<<"$CTX")

_json_out "$CTX"
exit 0
