#!/usr/bin/env bash
set -u

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
RUNTIME="${1:-claude}"

command -v node >/dev/null 2>&1 || exit 0

exec node "$PLUGIN_ROOT/scripts/check-install.ts" --runtime "$RUNTIME" 2>/dev/null
