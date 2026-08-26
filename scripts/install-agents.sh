#!/bin/bash
# install-agents.sh — Instala os LaunchAgents do utilizador (sem sudo):
#   - com.younglink.gestor          → servidor (arranca no login, reinicia se cair)
#   - com.younglink.gestor-updater  → verifica a main a cada 5 min e faz deploy
# Nota: LaunchAgents do utilizador correm enquanto a sessão estiver iniciada.
# Para arrancar no boot sem login é preciso um LaunchDaemon de sistema (com sudo).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
SRC="$PROJECT_DIR/scripts/launchd"
UID_NUM="$(id -u)"

mkdir -p "$AGENTS_DIR" "$HOME/Library/Logs/gestor"

for label in com.younglink.gestor com.younglink.gestor-updater; do
  echo "A instalar $label..."
  cp "$SRC/$label.plist" "$AGENTS_DIR/$label.plist"
  xattr -c "$AGENTS_DIR/$label.plist" 2>/dev/null || true
  # Recarregar (bootout + bootstrap) de forma idempotente
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$AGENTS_DIR/$label.plist"
  launchctl enable "gui/$UID_NUM/$label" 2>/dev/null || true
  echo "  OK"
done

echo ""
echo "Agentes instalados. Estado:"
launchctl print "gui/$UID_NUM/com.younglink.gestor" >/dev/null 2>&1 && echo "  ✅ servidor carregado" || echo "  ❌ servidor não carregou"
launchctl print "gui/$UID_NUM/com.younglink.gestor-updater" >/dev/null 2>&1 && echo "  ✅ updater carregado" || echo "  ❌ updater não carregou"
