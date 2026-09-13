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

blob = json.dumps(data, default=str).lower()
tool = str(data.get("tool_name") or "").lower()
server = str(data.get("mcp_server_name") or "").lower()
url = str(data.get("url") or data.get("mcp_server_url") or "").lower()

blocked = (
    "obsidian" in server
    or "obsidian" in tool
    or "127.0.0.1:27124" in blob
    or "localhost:27124" in blob
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
