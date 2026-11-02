#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/root/zenyn}"
PM2_NAME="${PM2_NAME:-zenyn}"
BRANCH="${BRANCH:-main}"
SKIP_NPM="${SKIP_NPM:-0}"

log() { echo "[$(date +%H:%M:%S)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[[ -d "$APP_DIR/.git" ]] || die "$APP_DIR bukan repo git (belum install? jalankan install.sh dulu)"
cd "$APP_DIR"

log "Repo: $APP_DIR | branch: $BRANCH"

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules; then
  log "Ada perubahan lokal BELUM di-commit:"
  git status --short
  read -r -p "Git stash perubahan lokal lalu lanjut update? [y/N] " ans
  [[ "${ans,,}" == "y" ]] || die "Update dibatalkan. Commit/stash dulu."
  git stash push -u -m "auto-stash sebelum update $(date +%F-%H%M%S)"
fi

log "Fetch origin"
git fetch --prune origin

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"
if [[ "$LOCAL" == "$REMOTE" ]]; then
  log "Sudah paling baru ($(git log -1 --format='%h %s')). Tidak ada update."
  exit 0
fi

log "Perubahan:"
git --no-pager log --oneline "$LOCAL..$REMOTE" | sed 's/^/  /'

if git diff --name-only "$LOCAL" "$REMOTE" | grep -qx 'package.json'; then
  SKIP_NPM=0
fi

log "Pull $BRANCH"
git pull --ff-only origin "$BRANCH"

if [[ "$SKIP_NPM" == "0" ]]; then
  log "npm install"
  npm install --no-audit --no-fund
else
  log "package.json tidak berubah, skip npm install"
fi

if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  log "Restart pm2: $PM2_NAME"
  pm2 restart "$PM2_NAME" --update-env
  pm2 save >/dev/null 2>&1 || true
  log "Status:"
  pm2 describe "$PM2_NAME" | grep -E "status|restarts|uptime" | sed 's/^/  /' || true
else
  log "pm2 proses '$PM2_NAME' tidak ditemukan. Jalankan manual:"
  echo "  pm2 start launcher.js --name $PM2_NAME"
fi

log "Selesai update ke $(git log -1 --format='%h %s')"
