#!/bin/bash
# deploy.sh — Verifica main por atualizações, faz build e reinicia o serviço
set -euo pipefail

PROJECT_DIR="/Users/young-link/Documents/GESTOR_YL"
LOG_DIR="$PROJECT_DIR/logs"
LOCK_FILE="$LOG_DIR/deploy.lock"
LOG_FILE="$LOG_DIR/deploy.log"
BRANCH="main"
SERVICE_LABEL="com.younglink.gestor"

NODE_BIN="/Users/young-link/.nvm/versions/node/v24.18.0/bin/node"
NPM_BIN="/Users/young-link/.nvm/versions/node/v24.18.0/bin/npm"
NPXBIN="/Users/young-link/.nvm/versions/node/v24.18.0/bin/npx"
export PATH="/Users/young-link/.nvm/versions/node/v24.18.0/bin:$PATH"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

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

cd "$PROJECT_DIR"

# Verificar se há commits novos
log "A verificar atualizações na branch $BRANCH..."
git fetch origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "Já na versão mais recente ($LOCAL_SHA). Nada a fazer."
  exit 0
fi

log "Nova versão detetada: $LOCAL_SHA -> $REMOTE_SHA"
log "Commits novos:"
git log --oneline "$LOCAL_SHA..$REMOTE_SHA" 2>&1 | tee -a "$LOG_FILE"

# Guardar referência para rollback
echo "$LOCAL_SHA" > "$LOG_DIR/last-good-sha.txt"

# Pull
log "A fazer pull..."
git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

# Instalar dependências (só se package-lock mudou)
if git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA" | grep -q "package-lock.json"; then
  log "package-lock.json alterado. A instalar dependências..."
  "$NPM_BIN" install --production=false 2>&1 | tee -a "$LOG_FILE"
else
  log "Dependências sem alterações. A saltar npm install."
fi

# Build
log "A compilar..."
if "$NPM_BIN" run build 2>&1 | tee -a "$LOG_FILE"; then
  log "Build concluído com sucesso."
else
  log "ERRO: Build falhou! A reverter para versão anterior..."
  git checkout "$LOCAL_SHA" 2>&1 | tee -a "$LOG_FILE"
  "$NPM_BIN" run build 2>&1 | tee -a "$LOG_FILE" || true
  log "Revertido para $LOCAL_SHA. O serviço mantém a versão anterior."
  exit 1
fi

# Reiniciar o serviço
log "A reiniciar o serviço..."
if launchctl list "$SERVICE_LABEL" &>/dev/null; then
  sudo launchctl kickstart -k "system/$SERVICE_LABEL" 2>&1 | tee -a "$LOG_FILE"
  log "Serviço reiniciado com sucesso."
else
  log "AVISO: Serviço $SERVICE_LABEL não encontrado no launchctl."
fi

log "Deploy concluído! Versão: $(git rev-parse --short HEAD)"
log "---"
