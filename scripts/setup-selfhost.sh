#!/bin/bash
# setup-selfhost.sh — Instala e configura o self-hosting do Gestor YL
# Corre com: sudo bash scripts/setup-selfhost.sh
set -euo pipefail

PROJECT_DIR="/Users/young-link/Documents/GESTOR_YL"
LAUNCHD_DIR="$PROJECT_DIR/scripts/launchd"
LOG_DIR="$PROJECT_DIR/logs"

echo "============================================"
echo "  Gestor YL — Setup Self-Hosting"
echo "============================================"
echo ""

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: Este script precisa de ser corrido com sudo."
  echo "Usa: sudo bash scripts/setup-selfhost.sh"
  exit 1
fi

# 1. Criar diretório de logs
echo "[1/7] A criar diretório de logs..."
mkdir -p "$LOG_DIR"
chown young-link:staff "$LOG_DIR"

# 2. Fazer build inicial
echo "[2/7] A fazer build inicial..."
cd "$PROJECT_DIR"
su - young-link -c "cd $PROJECT_DIR && export PATH=/Users/young-link/.nvm/versions/node/v24.18.0/bin:\$PATH && npm install && npm run build"
echo "     Build concluído."

# 3. Instalar Caddy
echo "[3/7] A verificar Caddy..."
if ! command -v caddy &>/dev/null; then
  if command -v brew &>/dev/null; then
    echo "     A instalar Caddy via Homebrew..."
    su - young-link -c "brew install caddy"
  else
    echo "     ERRO: Homebrew não encontrado. Instala o Caddy manualmente."
    exit 1
  fi
else
  echo "     Caddy já instalado: $(which caddy)"
fi

# 4. Remover Cloudflare Tunnel (se existir)
echo "[4/7] A limpar Cloudflare Tunnel..."
launchctl bootout system/com.younglink.cloudflared 2>/dev/null || true
rm -f /Library/LaunchDaemons/com.younglink.cloudflared.plist
rm -f "$LOG_DIR"/cloudflared-*.log
echo "     Cloudflare Tunnel removido."

# 5. Parar serviços existentes
echo "[5/7] A preparar serviços..."
launchctl bootout system/com.younglink.gestor 2>/dev/null || true
launchctl bootout system/com.younglink.gestor-updater 2>/dev/null || true
launchctl bootout system/com.younglink.caddy 2>/dev/null || true

# 6. Instalar serviços
echo "[6/7] A instalar serviços do sistema..."

cp "$LAUNCHD_DIR/com.younglink.gestor.plist" /Library/LaunchDaemons/
cp "$LAUNCHD_DIR/com.younglink.gestor-updater.plist" /Library/LaunchDaemons/
cp "$LAUNCHD_DIR/com.younglink.caddy.plist" /Library/LaunchDaemons/

for f in com.younglink.gestor.plist com.younglink.gestor-updater.plist com.younglink.caddy.plist; do
  xattr -c "/Library/LaunchDaemons/$f" 2>/dev/null || true
  chown root:wheel "/Library/LaunchDaemons/$f"
  chmod 644 "/Library/LaunchDaemons/$f"
done

echo "     Serviços instalados em /Library/LaunchDaemons/"

# Configurar sudoers para o deploy
SUDOERS_LINE="young-link ALL=(ALL) NOPASSWD: /bin/launchctl kickstart -k system/com.younglink.gestor"
SUDOERS_FILE="/etc/sudoers.d/gestor-deploy"
if [ ! -f "$SUDOERS_FILE" ] || ! grep -qF "$SUDOERS_LINE" "$SUDOERS_FILE"; then
  echo "$SUDOERS_LINE" > "$SUDOERS_FILE"
  chmod 440 "$SUDOERS_FILE"
fi

# 7. Arrancar serviços
echo "[7/7] A arrancar serviços..."
launchctl bootstrap system /Library/LaunchDaemons/com.younglink.gestor.plist
echo "     Gestor YL arrancado."

launchctl bootstrap system /Library/LaunchDaemons/com.younglink.gestor-updater.plist
echo "     Auto-updater arrancado."

launchctl bootstrap system /Library/LaunchDaemons/com.younglink.caddy.plist
echo "     Caddy (HTTPS reverse proxy) arrancado."

echo ""
echo "============================================"
echo "  Setup concluído!"
echo "============================================"
echo ""
echo "Serviços ativos:"
echo "  - Gestor YL        → http://localhost:3000"
echo "  - Caddy            → HTTPS reverse proxy (portas 80/443)"
echo "  - Auto-updater     → verifica main a cada 5 min"
echo ""
echo "PRÓXIMO PASSO — Configurar o router e DNS:"
echo ""
echo "  1. No router, cria duas regras de port forwarding:"
echo "     Porta 80  (TCP) → IP do Mac Mini, porta 80"
echo "     Porta 443 (TCP) → IP do Mac Mini, porta 443"
echo ""
echo "  2. No Squarespace DNS, altera o registo 'gestor':"
echo "     Tipo: A"
echo "     Nome: gestor"
echo "     Dados: <o teu IP público>"
echo "     (descobre o IP com: curl -s ifconfig.me)"
echo ""
echo "  3. Se o teu IP público mudar, atualiza o registo A."
echo "     (Para IP dinâmico, configura DuckDNS ou similar)"
echo ""
echo "Comandos úteis:"
echo "  Ver logs do servidor:  tail -f $LOG_DIR/gestor-stdout.log"
echo "  Ver logs do Caddy:     tail -f $LOG_DIR/caddy-stderr.log"
echo "  Ver logs do deploy:    tail -f $LOG_DIR/deploy.log"
echo "  Reiniciar servidor:    sudo launchctl kickstart -k system/com.younglink.gestor"
echo "  Reiniciar Caddy:       sudo launchctl kickstart -k system/com.younglink.caddy"
echo "  Parar tudo:            sudo launchctl bootout system/com.younglink.gestor"
echo "  Ver IP público:        curl -s ifconfig.me"
echo "  Estado dos serviços:   sudo bash scripts/status.sh"
echo ""
