#!/usr/bin/env bash
set -u
umask 077

python3 -c '
import json
import sys

raw = sys.stdin.read()
try:
    data = json.loads(raw) if raw.strip() else {}
except json.JSONDecodeError:
    data = {}

def field(*keys):
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value:
            return value.lower()
    return ""

tool = field("tool_name")
server = field("mcp_server_name")
url = field("url", "mcp_server_url")
command = field("command")
inp = data.get("tool_input")
if isinstance(inp, dict):
    command = command or str(inp.get("command") or inp.get("url") or "").lower()
elif isinstance(inp, str):
    command = command or inp.lower()

haystack = " ".join(part for part in (url, command) if part)

blocked = (
    "obsidian" in server
    or "obsidian" in tool
    or "127.0.0.1:27124" in haystack
    or "localhost:27124" in haystack
    or "[::1]:27124" in haystack
    or "27124" in url
)

if blocked:
    print(json.dumps({
        "permission": "deny",
        "user_message": "Vault access is filesystem-only (ADR-0001). Obsidian MCP and the Local REST API are blocked.",
        "agent_message": "Do not use Obsidian MCP or http://127.0.0.1:27124. Read and write the vault via the filesystem only.",
    }))
else:
    print(json.dumps({"permission": "allow"}))
'
