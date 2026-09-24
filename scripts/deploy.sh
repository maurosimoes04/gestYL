#!/bin/bash
# deploy.sh — Verifica a main por atualizações, faz build e reinicia o serviço.
# Usa git -C e npm --prefix para evitar cd a ~/Documents (bloqueado pelo TCC do macOS).
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG_DIR="$PROJECT_DIR/logs"
LOCK_FILE="$LOG_DIR/deploy.lock"
LOG_FILE="$LOG_DIR/deploy.log"
BRANCH="main"
SERVICE_LABEL="com.younglink.gestor"

# Garantir que o Node está no PATH (launchd arranca com PATH mínimo).
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi
if ! command -v node >/dev/null 2>&1; then
  NVM_NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "$NVM_NODE_BIN" ] && export PATH="$NVM_NODE_BIN:$PATH"
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Evitar execuções simultâneas
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    log "Deploy já em curso (PID $LOCK_PID). A sair."
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

log "A verificar atualizações na branch $BRANCH..."
git -C "$PROJECT_DIR" fetch origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

LOCAL_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD)
REMOTE_SHA=$(git -C "$PROJECT_DIR" rev-parse "origin/$BRANCH")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "Já na versão mais recente ($(git -C "$PROJECT_DIR" rev-parse --short HEAD)). Nada a fazer."
  exit 0
fi

log "Nova versão: $LOCAL_SHA -> $REMOTE_SHA"
git -C "$PROJECT_DIR" log --oneline "$LOCAL_SHA..$REMOTE_SHA" 2>&1 | tee -a "$LOG_FILE"
echo "$LOCAL_SHA" > "$LOG_DIR/last-good-sha.txt"

log "A fazer pull..."
git -C "$PROJECT_DIR" pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

if git -C "$PROJECT_DIR" diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" | grep -q "package-lock.json\|package.json"; then
  log "Dependências alteradas. A instalar..."
  npm --prefix "$PROJECT_DIR" install --no-audit --no-fund 2>&1 | tee -a "$LOG_FILE"
else
  log "Dependências sem alterações."
fi

log "A compilar (backend + frontend)..."
if npm --prefix "$PROJECT_DIR" run build 2>&1 | tee -a "$LOG_FILE"; then
  log "Build concluído."
else
  log "ERRO: build falhou. A reverter para $LOCAL_SHA..."
  git -C "$PROJECT_DIR" reset --hard "$LOCAL_SHA" 2>&1 | tee -a "$LOG_FILE"
  npm --prefix "$PROJECT_DIR" run build 2>&1 | tee -a "$LOG_FILE" || true
  log "Revertido. O serviço mantém a versão anterior."
  exit 1
fi

log "A reiniciar o serviço ($SERVICE_LABEL)..."
sudo /bin/launchctl kickstart -k "system/$SERVICE_LABEL" 2>&1 | tee -a "$LOG_FILE"
log "Serviço reiniciado via LaunchDaemon."

log "Deploy concluído. Versão: $(git -C "$PROJECT_DIR" rev-parse --short HEAD)"
log "---"
