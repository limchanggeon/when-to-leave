#!/usr/bin/env bash
# 배포 갱신. VM 에서 `sudo /srv/whenigo/deploy/update.sh` 로 돌린다.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "sudo 로 실행하세요"; exit 1; }

APP_USER=whenigo
APP_DIR=/srv/whenigo
cd "$APP_DIR"

# 배포 디렉터리는 원격을 그대로 따라간다 (로컬 변경은 버린다)
sudo -u "$APP_USER" git fetch origin main:refs/remotes/origin/main
sudo -u "$APP_USER" git reset --hard origin/main
sudo -u "$APP_USER" pnpm install --frozen-lockfile
sudo -u "$APP_USER" pnpm build     # dist/ 를 다시 만든다. 서버가 이걸 그대로 서빙한다.

systemctl restart whenigo
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo " ← 살아있음"
