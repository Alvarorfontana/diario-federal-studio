#!/usr/bin/env bash
# Arranca el puente a YouTube dentro de GitHub Codespaces.
# 1) El servidor (app.py) en el puerto 8000.
# 2) Un túnel gratuito de Cloudflare (sin cuenta) que le da una dirección pública https://….trycloudflare.com
# 3) Publica esa dirección en la rama "puente" del repo; la consola del estudio la lee sola.
cd "$(dirname "$0")"
REPO="${GITHUB_REPOSITORY:-Alvarorfontana/diario-federal-studio}"

pkill -f "python app.py" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
PORT=8000 setsid nohup python app.py > /tmp/puente.log 2>&1 < /dev/null &

if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x /tmp/cloudflared ]; then
  echo "Bajando cloudflared…"
  curl -sSL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x /tmp/cloudflared
fi
CF=$(command -v cloudflared || echo /tmp/cloudflared)
: > /tmp/tunel.log
setsid nohup "$CF" tunnel --no-autoupdate --url http://localhost:8000 > /tmp/tunel.log 2>&1 < /dev/null &

URL=""
for i in $(seq 1 40); do
  sleep 2
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/tunel.log | head -1)
  [ -n "$URL" ] && break
done
if [ -z "$URL" ]; then echo "No se pudo abrir el túnel. Mirá /tmp/tunel.log"; exit 1; fi

# publicar la dirección para la consola
JSON=$(printf '{"url":"%s","desde":"%s"}' "$URL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
B64=$(printf '%s' "$JSON" | base64 -w0)
if ! gh api "repos/$REPO/branches/puente" >/dev/null 2>&1; then
  BASE=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
  gh api -X POST "repos/$REPO/git/refs" -f ref=refs/heads/puente -f sha="$BASE" >/dev/null
fi
SHA=$(gh api "repos/$REPO/contents/puente.json?ref=puente" --jq .sha 2>/dev/null || true)
gh api -X PUT "repos/$REPO/contents/puente.json" -f message="Dirección del puente" -f content="$B64" -f branch=puente ${SHA:+-f sha="$SHA"} >/dev/null \
  && echo "Puente DF listo: $URL (la consola lo encuentra sola)" \
  || echo "Puente DF listo: $URL  ← pegala en la consola, pestaña Salidas"
