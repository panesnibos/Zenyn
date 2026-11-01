#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-}"
APP_DIR="/root/zenyn"
NODE_MAJOR=20

if [[ $EUID -ne 0 ]]; then
  echo "Jalankan sebagai root." >&2
  exit 1
fi
if [[ -z "$REPO_URL" ]]; then
  echo "Usage: bash install.sh <repo-url>" >&2
  exit 1
fi

echo "[1/6] Paket sistem"
apt update
apt install -y curl build-essential python3 git sqlite3 ca-certificates

echo "[2/6] Node.js ${NODE_MAJOR} LTS"
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt install -y nodejs
fi
node -v

echo "[3/6] Clone / update repo"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "[4/6] npm install"
npm install
npm cache clean --force

echo "[5/6] pm2 (bot belum start - pairing manual dulu)"
npm i -g pm2
if pm2 describe zenyn >/dev/null 2>&1; then
  pm2 stop zenyn || true
fi

echo "[6/6] Cron backup harian"
mkdir -p /root/backup
CRON_LINE="0 3 * * * sqlite3 ${APP_DIR}/database/rpg/zenyn.db \".backup '/root/backup/zenyn-\$(date +\\%F).db'\""
( crontab -l 2>/dev/null | grep -v 'zenyn-.*\.db' ; echo "$CRON_LINE" ) | crontab -

cat <<'EOF'

Selesai instalasi. Sekarang pairing (bukan QR):
  1. pm2 start launcher.js --name zenyn
  2. pm2 logs zenyn
  3. Tunggu "PAIRING CODE" lalu 8 digit muncul
  4. WhatsApp nomor di config.js -> Linked Devices -> Link a Device
     -> Link with phone number -> masukkan kode
  5. Tunggu "Bot connected!"
  6. pm2 save && pm2 startup
EOF
