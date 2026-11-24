#!/bin/bash
# Deploy the MeetingDictation website (apps/web) on wele_eu.
#
# Run on the server from the repo root (today: /root/meetingdictation):
#   git pull && ./script.sh
#
# Server layout:
#   repo        /root/meetingdictation
#   env         /root/meetingdictation/apps/web/.env   (gitignored, see .env.example)
#   data        /root/meetingdictation-data            (prod.db + uploads/, outside the repo)
#   pm2         meetingdictation.web on 127.0.0.1:4100 (apps/web/ecosystem.config.js)
#   nginx       nginx/meetingdictation.com.conf -> /etc/nginx/conf.d/
#   TLS         Let's Encrypt cert `meetingdictation.com` (apex + www), webroot renewal
#
# Usage:
#   ./script.sh              # npm ci, prisma db push, build, pm2 restart
#   ./script.sh --restart    # skip install and build, just restart pm2
#   ./script.sh --no-install # skip npm ci
#   ./script.sh --nginx      # also install nginx/meetingdictation.com.conf and reload nginx

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
APP_NAME="meetingdictation.web"
PORT=4100
HEALTH_URL="http://127.0.0.1:${PORT}/login"

BUILD=true
RUN_INSTALL=true
NGINX=false

for arg in "$@"; do
  case "$arg" in
    --restart)    BUILD=false; RUN_INSTALL=false ;;
    --no-install) RUN_INSTALL=false ;;
    --nginx)      NGINX=true ;;
    -h|--help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg (options: --restart, --no-install, --nginx)"
      exit 1
      ;;
  esac
done

# A non-interactive `ssh host ./script.sh` gets the system Node (18); load nvm.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use 22 >/dev/null
fi
NODE_MAJOR="$(node -v | sed 's/^v//; s/\..*//')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node $(node -v) on PATH; this app is deployed on Node 22 (nvm install 22)."
  exit 1
fi

if [ ! -f "$WEB_DIR/.env" ]; then
  echo "ERROR: $WEB_DIR/.env missing. Copy .env.example and set DATABASE_URL, AUTH_SECRET, AUTH_URL, UPLOAD_DIR."
  exit 1
fi

echo "========== DEPLOYING $APP_NAME (build=$BUILD install=$RUN_INSTALL nginx=$NGINX) =========="

if [ "$RUN_INSTALL" = true ]; then
  echo "===== Dependencies ====="
  (cd "$ROOT_DIR" && npm ci --no-audit --no-fund)
fi

if [ "$BUILD" = true ]; then
  echo "===== Database schema ====="
  (cd "$WEB_DIR" && npx prisma db push --skip-generate)
  echo "===== Build ====="
  (cd "$WEB_DIR" && nice -n 10 env NODE_OPTIONS="--max-old-space-size=2048" npm run build)
fi

echo "===== PM2 ====="
(cd "$WEB_DIR" && pm2 startOrRestart ecosystem.config.js --only "$APP_NAME" --env production)
pm2 save >/dev/null 2>&1 || true

if [ "$NGINX" = true ]; then
  echo "===== nginx ====="
  cp "$ROOT_DIR/nginx/meetingdictation.com.conf" /etc/nginx/conf.d/meetingdictation.com.conf
  nginx -t && systemctl reload nginx
fi

echo "===== Health check: $HEALTH_URL ====="
deadline=$(( SECONDS + ${HEALTH_TIMEOUT:-60} ))
until curl -fs -o /dev/null --max-time 5 "$HEALTH_URL"; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "FAILED — check: pm2 logs $APP_NAME"
    exit 1
  fi
  sleep 2
done
echo "OK"
echo "========== DEPLOY COMPLETE =========="
