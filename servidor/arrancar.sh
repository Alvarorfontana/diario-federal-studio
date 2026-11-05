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

# publicar la dirección para la consola (API de GitHub con el permiso que trae el codespace)
JSON=$(printf '{"url":"%s","desde":"%s"}' "$URL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")
B64=$(printf '%s' "$JSON" | base64 -w0)
API="https://api.github.com/repos/$REPO"
AUT=(-H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json")
ok=0
if [ -n "$GITHUB_TOKEN" ]; then
  if ! curl -sf "${AUT[@]}" "$API/branches/puente" >/dev/null; then
    BASE=$(curl -sf "${AUT[@]}" "$API/git/ref/heads/main" | python3 -c 'import sys,json;print(json.load(sys.stdin)["object"]["sha"])')
    curl -sf -X POST "${AUT[@]}" "$API/git/refs" -d "{\"ref\":\"refs/heads/puente\",\"sha\":\"$BASE\"}" >/dev/null
  fi
  SHA=$(curl -sf "${AUT[@]}" "$API/contents/puente.json?ref=puente" | python3 -c 'import sys,json;print(json.load(sys.stdin)["sha"])' 2>/dev/null)
  CUERPO="{\"message\":\"Dirección del puente\",\"content\":\"$B64\",\"branch\":\"puente\"${SHA:+,\"sha\":\"$SHA\"}}"
  curl -sf -X PUT "${AUT[@]}" "$API/contents/puente.json" -d "$CUERPO" >/dev/null && ok=1
fi
if [ $ok = 1 ]; then
  echo "Puente DF listo: $URL (la consola lo encuentra sola)"
else
  echo "Puente DF listo: $URL  ← pegala en la consola, pestaña Salidas"
fi
