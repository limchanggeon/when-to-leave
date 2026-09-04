#!/usr/bin/env bash
# 배포 갱신. VM 에서 `sudo -u whenigo deploy/update.sh` 로 돌린다.
set -euo pipefail
cd /srv/whenigo

git pull --ff-only
pnpm install --frozen-lockfile
pnpm build          # dist/ 를 다시 만든다. 서버가 이걸 그대로 서빙한다.
pnpm typecheck

sudo systemctl restart whenigo
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo " ← 살아있음"
