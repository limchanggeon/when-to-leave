#!/usr/bin/env bash
#
# 우분투 VM 한 대를 언제나가 서버로 만든다.
# GCP·Lightsail·EC2·오라클 — VM 이기만 하면 어디서든 같다.
#
#   sudo DOMAIN=whenigo.p-e.kr REPO=git@github.com:limchanggeon/when-to-leave.git \
#        bash bootstrap.sh
#
# 여러 번 돌려도 안전하다. 이미 되어 있는 단계는 건너뛴다.

set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN 을 넘겨주세요 (예: DOMAIN=whenigo.p-e.kr)}"
REPO="${REPO:?REPO 를 넘겨주세요 (git clone 주소)}"
APP_USER=whenigo
APP_DIR=/srv/whenigo
ENV_FILE=/etc/whenigo.env

[[ $EUID -eq 0 ]] || { echo "sudo 로 실행하세요"; exit 1; }

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

say "1/8 기본 패키지"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates >/dev/null

say "2/8 스왑"
# 메모리 2GB 미만이면 pnpm build 가 OOM 으로 죽는다.
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ $mem_mb -lt 2048 && ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "메모리 ${mem_mb}MB → 스왑 2G 추가"
elif [[ -f /swapfile ]]; then
  swapon /swapfile 2>/dev/null || true
  echo "이미 있음"
else
  echo "건너뜀 (메모리 ${mem_mb}MB — 충분함)"
fi

say "3/8 Node"
# node:sqlite 는 Node 22.5+ 에서만 있다. 배포판 기본이 낮으면 NodeSource 로 올린다.
need_node=1
if command -v node >/dev/null; then
  v=$(node -p 'process.versions.node.split(".").slice(0,2).map(Number).join(",")')
  major=${v%%,*}; minor=${v##*,}
  if (( major > 22 || (major == 22 && minor >= 5) )); then need_node=0; fi
fi
if [[ $need_node -eq 1 ]]; then
  apt-get install -y -qq nodejs npm >/dev/null 2>&1 || true
  if ! node -e 'require("node:sqlite")' >/dev/null 2>&1; then
    echo "배포판 Node 가 낮음 → NodeSource 로 24 설치"
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  fi
fi
node -e 'const{DatabaseSync}=require("node:sqlite");new DatabaseSync(":memory:").exec("create table t(a)")' \
  && echo "node $(node -v) — node:sqlite OK"
command -v pnpm >/dev/null || npm i -g pnpm >/dev/null 2>&1
echo "pnpm $(pnpm -v)"

say "4/8 앱 사용자와 소스"
id -u "$APP_USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# 배포 키가 $APP_DIR/.ssh 에 생기므로 디렉터리가 비지 않는다.
# git clone 은 비어있지 않은 곳을 거부하므로 init+fetch 로 채운다.
KEY="$APP_DIR/.ssh/id_ed25519"
if [[ "$REPO" == git@* && ! -f "$KEY" ]]; then
  sudo -u "$APP_USER" mkdir -p "$APP_DIR/.ssh"
  sudo -u "$APP_USER" ssh-keygen -t ed25519 -N '' -f "$KEY" -C "whenigo-deploy" >/dev/null
  sudo -u "$APP_USER" ssh-keyscan -H github.com >> "$APP_DIR/.ssh/known_hosts" 2>/dev/null
  echo
  echo "──────────── 배포 키를 등록해야 합니다 ────────────"
  cat "$KEY.pub"
  echo "───────────────────────────────────────────────────"
  echo "GitHub → 저장소 → Settings → Deploy keys → Add deploy key"
  echo "위 한 줄을 붙여넣고(쓰기 권한 불필요), 이 스크립트를 다시 실행하세요."
  exit 2
fi

# HOME 이 어떻게 잡히든 이 키를 쓰도록 못박는다
GIT_SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"
git_as() { sudo -u "$APP_USER" GIT_SSH_COMMAND="$GIT_SSH" git -C "$APP_DIR" "$@"; }

# 배포 디렉터리는 원격을 그대로 따라간다. merge 는 도구가 만들어 둔
# 추적되지 않는 파일(pnpm-workspace.yaml 등)에 막히지만 reset 은 덮어쓴다.
if [[ -d "$APP_DIR/.git" ]]; then
  git_as fetch origin main:refs/remotes/origin/main
  git_as reset --hard origin/main
else
  git_as init -q -b main
  git_as remote add origin "$REPO"
  git_as fetch origin main:refs/remotes/origin/main
  git_as checkout -q -B main origin/main
fi
echo "소스: $(git_as log -1 --format='%h %s')"

say "5/8 빌드"
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile
sudo -u "$APP_USER" pnpm build

say "6/8 환경변수"
if [[ -f "$ENV_FILE" ]]; then
  echo "이미 있음 — 건드리지 않음 ($ENV_FILE)"
else
  install -m 600 -o root -g root /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<EOF
# 언제나가 운영 환경변수. 이 파일은 root 만 읽는다.
# 채운 뒤: sudo systemctl restart whenigo

SESSION_SECRET=$(openssl rand -hex 32)
GOOGLE_REDIRECT_URI=https://${DOMAIN}/api/calendar/callback
ODSAY_SERVICE_URL=https://${DOMAIN}

KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
GOOGLE_CLIENT_SECRET=
GOOGLE_MAPS_SERVER_KEY=
ODSAY_API_KEY=
TAGO_SERVICE_KEY=
EOF
  echo "만들었습니다. SESSION_SECRET 은 새로 뽑아 넣었고, 나머지 키는 비어 있습니다."
fi

say "7/8 서비스 등록"
cp "$APP_DIR/deploy/whenigo.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable whenigo >/dev/null
systemctl restart whenigo
sleep 2
if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then
  echo "서버 살아있음"
else
  echo "서버가 안 뜹니다 → journalctl -u whenigo -n 50 --no-pager"
  exit 1
fi

say "8/8 Caddy (HTTPS)"
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
sed "s/whenigo\.p-e\.kr/${DOMAIN}/" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy 2>/dev/null || systemctl restart caddy

cat <<EOF

────────────────────────────────────────────────
설치 끝. 남은 일은 세 가지입니다.

1) 키 채우기
     sudo nano ${ENV_FILE}
     sudo systemctl restart whenigo

2) DNS — 내도메인.한국에서 ${DOMAIN} 의 A 레코드를
   이 서버 IP 로. 앞 입력칸은 비워둡니다.
     이 서버 IP: $(curl -s --max-time 5 https://api.ipify.org || echo '(조회 실패)')

3) DNS 가 반영되면 인증서가 자동으로 발급됩니다.
     dig +short ${DOMAIN}
     journalctl -u caddy -f

콘솔(카카오·구글·ODsay)에 등록할 주소는 deploy/README.md 9번 표에 있습니다.
────────────────────────────────────────────────
EOF
