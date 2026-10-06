#!/usr/bin/env bash
# 별도 작업 트리에서 검증 후 교체. 실패하면 이전 코드/자산/의존성으로 복구한다.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "sudo 로 실행하세요"; exit 1; }

APP_USER=whenigo
APP_DIR=/srv/whenigo
cd "$APP_DIR"
exec 9>/var/lock/whenigo-deploy.lock
flock -n 9 || { echo '다른 배포가 실행 중입니다'; exit 1; }
run() { sudo -u "$APP_USER" "$@"; }
[[ -z $(run git status --porcelain --untracked-files=no) ]] || {
  echo '운영 저장소에 추적 파일 변경이 있습니다'; exit 1;
}
run git fetch origin main:refs/remotes/origin/main
TARGET=$(run git rev-parse --verify "${1:-origin/main}^{commit}")
PREVIOUS=$(run git rev-parse HEAD)
STAGE=$(mktemp -d /srv/whenigo-stage.XXXXXX)
chown "$APP_USER:$APP_USER" "$STAGE"
ROLLBACK=$(mktemp -d /srv/whenigo-rollback.XXXXXX)
chmod 700 "$ROLLBACK"
SWITCHING=0
cleanup() {
  local status=$?
  trap - EXIT
  if [[ $status -ne 0 && $SWITCHING -eq 1 ]]; then
    echo "배포 실패. 이전 커밋 $PREVIOUS 로 복구합니다."
    systemctl stop whenigo || true
    run git reset --hard "$PREVIOUS"
    if [[ -d "$ROLLBACK/dist" ]]; then
      rm -rf "$APP_DIR/dist"
      mv "$ROLLBACK/dist" "$APP_DIR/dist"
    fi
    if [[ -d "$ROLLBACK/node_modules" ]]; then
      rm -rf "$APP_DIR/node_modules"
      mv "$ROLLBACK/node_modules" "$APP_DIR/node_modules"
    fi
    systemctl restart whenigo
  fi
  cd "$APP_DIR"
  run git worktree remove --force "$STAGE" || true
  echo "복구 자료: $ROLLBACK (이전 커밋: $PREVIOUS)"
  exit "$status"
}
trap cleanup EXIT
run git worktree add --detach "$STAGE" "$TARGET"
if [[ -f "$APP_DIR/.env" ]]; then
  install -m 600 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/.env" "$STAGE/.env"
fi
cd "$STAGE"
run pnpm install --frozen-lockfile
run pnpm typecheck
run pnpm exec vitest run --maxWorkers=2
run pnpm build
run pnpm smoke
systemctl start whenigo-backup.service
cd "$APP_DIR"
SWITCHING=1
systemctl stop whenigo
run git reset --hard "$TARGET"
mv "$APP_DIR/dist" "$ROLLBACK/dist"
mv "$APP_DIR/node_modules" "$ROLLBACK/node_modules"
mv "$STAGE/dist" "$APP_DIR/dist"
mv "$STAGE/node_modules" "$APP_DIR/node_modules"
systemctl restart whenigo
for attempt in {1..20}; do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health > "$ROLLBACK/health.json"; then
    node -e 'const h=require(process.argv[1]);if(!h.ok || h.missingEnv.length)process.exit(1)' "$ROLLBACK/health.json"
    echo "릴리즈 완료: $TARGET"
    SWITCHING=0
    exit 0
  fi
  sleep 1
done
echo '기동 확인 실패'
exit 1
