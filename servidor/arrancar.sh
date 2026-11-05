#!/usr/bin/env bash
# Arranca el puente a YouTube dentro de GitHub Codespaces y deja el puerto 8000 público
# (la consola del estudio se conecta a https://<nombre-del-codespace>-8000.app.github.dev).
cd "$(dirname "$0")"
pkill -f "python app.py" 2>/dev/null || true
PORT=8000 setsid nohup python app.py > /tmp/puente.log 2>&1 < /dev/null &
disown || true
for i in 1 2 3 4 5 6; do
  sleep 5
  if [ -n "$CODESPACE_NAME" ] && gh codespace ports visibility 8000:public -c "$CODESPACE_NAME" >/dev/null 2>&1; then
    echo "Puente DF listo en: https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
    exit 0
  fi
done
echo "El puente arrancó. Si la consola no lo encuentra: pestaña PORTS → puerto 8000 → clic derecho → Port Visibility → Public."
