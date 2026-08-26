#!/bin/bash
# run-server.sh — arranca o servidor Gestor YL. Usado pelo LaunchAgent.
# Corre via /bin/bash (que o launchd executa de forma fiável) e resolve o Node
# através do nvm — evita o launchd ter de executar diretamente o binário do nvm.
set -e

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi
if ! command -v node >/dev/null 2>&1; then
  NVM_NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$NVM_NODE_BIN" ] && export PATH="$NVM_NODE_BIN:$PATH"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NODE_ENV="${NODE_ENV:-production}"

exec node dist/backend/server.js
