# 배포 — Google Cloud 무료 VM (e2-micro)

프론트엔드와 API 를 **한 서버, 한 주소**로 올린다. Express 가 `dist/` 를 직접
서빙하므로 CORS 설정이 필요 없고, 세션 쿠키(`sameSite: 'lax'`)가 그대로 동작한다.

```
브라우저 → Caddy(443, TLS) → Express(127.0.0.1:8787) → SQLite(/var/lib/whenigo/app.db)
                                        └ dist/ 정적 파일
```

3번부터는 **우분투 VM 이면 어디서든 같다.** 나중에 서울 리전으로 옮기더라도
1·2번만 다시 하면 되고 나머지는 그대로 쓴다.

---

## 1. 인스턴스 만들기

Google Cloud 콘솔 → Compute Engine → VM 인스턴스 → 인스턴스 만들기.
(처음이면 Compute Engine API 사용 설정을 먼저 누르라고 나온다)

프로젝트는 지도 API 쓰는 것과 같은 걸 써도 되고 새로 만들어도 된다.
결제 계정만 연결돼 있으면 된다.

**무료 한도를 지키려면 아래 네 가지를 정확히 골라야 한다.** 하나라도 어긋나면
과금이 시작된다:

| 항목 | 값 | 왜 |
|---|---|---|
| 리전 | **us-west1 (오리건)** | 무료 대상은 us-west1 / us-central1 / us-east1 뿐이다. 그중 한국에서 가장 가깝다 |
| 머신 유형 | **e2-micro** | 이것만 무료. e2-small 부터 과금 |
| 부팅 디스크 이미지 | Ubuntu 26.04 LTS | |
| 부팅 디스크 **유형** | **표준 영구 디스크 (Standard PD)**, 30GB | 기본값인 균형 있는(Balanced) 디스크는 **무료가 아니다**. 반드시 바꿀 것 |

방화벽 항목에서 **HTTP 트래픽 허용**과 **HTTPS 트래픽 허용**을 둘 다 체크한다.
(오라클과 달리 GCP 는 이 체크박스 하나로 끝난다. 이미지 안에 별도 방화벽이 없다)

무료 한도는 바뀔 수 있으니 만들기 전에 한 번 확인:
<https://cloud.google.com/free/docs/free-cloud-features>

## 2. 외부 IP 를 고정으로 — 이걸 빼먹으면 나중에 사이트가 죽는다

기본값은 **임시 IP** 라서 인스턴스를 재시작하면 주소가 바뀐다. 그러면
도메인이 엉뚱한 곳을 가리키게 되고, 원인 찾기가 은근히 까다롭다.

VPC 네트워크 → IP 주소 → 우리 인스턴스의 외부 IP 줄에서
**임시 → 고정으로 예약**.

> 고정 IP 는 인스턴스에 붙어서 켜져 있는 동안은 무료다.
> 인스턴스를 지우고 IP 만 남겨두면 그때부터 과금되니, 정리할 때 같이 지울 것.

**이 IP 를 적어둔다.** 7번에서 쓴다.

## 3. 기본 세팅

콘솔의 **SSH** 버튼으로 접속한다. (별도 키 설정 없이 브라우저에서 바로 열린다)

```bash
sudo apt-get update && sudo apt-get install -y git curl

# e2-micro 는 메모리가 1GB 라 pnpm build 가 OOM 으로 죽는다. 스왑부터.
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # Swap 줄에 2.0Gi 가 보여야 한다

# Node — node:sqlite 가 Node 22.5+ 를 요구한다.
# Ubuntu 26.04(resolute) 는 기본 저장소에 22.22 가 있어서 이걸로 충분하다.
sudo apt-get install -y nodejs npm
node -v

# 기본 Node 가 낮은 배포판이면 NodeSource 를 쓴다.
# (저장소가 nodistro 하나라 배포판을 가리지 않는다)
#   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
#   sudo apt-get install -y nodejs

sudo npm i -g pnpm

# node:sqlite 가 플래그 없이 되는지 확인. 여기서 막히면 Node 를 올려야 한다.
node -e "const {DatabaseSync}=require('node:sqlite'); new DatabaseSync(':memory:').exec('create table t(a)'); console.log('node:sqlite OK')"
```

## 4. 앱 올리기

```bash
sudo useradd --system --home /srv/whenigo --shell /usr/sbin/nologin whenigo
sudo mkdir -p /srv/whenigo && sudo chown whenigo:whenigo /srv/whenigo

sudo -u whenigo git clone <저장소 주소> /srv/whenigo
cd /srv/whenigo
sudo -u whenigo pnpm install --frozen-lockfile
sudo -u whenigo pnpm build
```

## 5. 비밀값

로컬 `.env` 를 그대로 올리지 말고, 아래 값들을 **운영용으로 바꿔서** 적는다.

```bash
sudo install -m 600 -o root -g root /dev/null /etc/whenigo.env
sudo nano /etc/whenigo.env
```

```ini
SESSION_SECRET=<openssl rand -hex 32 로 새로 뽑은 값. 로컬 것 재사용 금지>
GOOGLE_REDIRECT_URI=https://whenigo.p-e.kr/api/calendar/callback
ODSAY_SERVICE_URL=https://whenigo.p-e.kr

KAKAO_REST_API_KEY=...
KAKAO_CLIENT_SECRET=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_MAPS_SERVER_KEY=...
ODSAY_API_KEY=...
TAGO_SERVICE_KEY=...
```

> `VITE_` 로 시작하는 값은 여기 넣어도 소용없다. 그것들은 빌드 시점에
> 번들에 박히므로 **빌드하는 쪽**(`/srv/whenigo/.env`)에 있어야 한다.

## 6. 서비스 등록

```bash
sudo cp /srv/whenigo/deploy/whenigo.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whenigo
curl -s http://127.0.0.1:8787/api/health    # {"ok":true,...}
journalctl -u whenigo -n 30 --no-pager
```

## 7. DNS — 내도메인.한국

`whenigo.p-e.kr` 관리 화면 → **고급설정(DNS)** → **IP연결(A)**:

- 앞의 입력칸: **비워둔다** (비워두면 `whenigo.p-e.kr` 자체를 가리킨다)
- 값: 2번에서 예약한 **고정 IP**
- 체크박스를 켜고 보안코드 입력 → 수정하기

**웹포워딩은 쓰지 않는다.** 다른 주소로 튕겨주는 기능이라 주소창에 도메인이
남지 않고 쿠키·HTTPS 가 어긋난다.

반영 확인:

```bash
dig +short whenigo.p-e.kr
```

## 8. HTTPS

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo cp /srv/whenigo/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
journalctl -u caddy -n 30 --no-pager   # 인증서 발급 로그
```

DNS 가 먼저 반영돼 있어야 인증서가 나온다. 순서를 지킬 것.

## 9. 콘솔에 새 주소 등록

여기까지 하면 열리지만, **로그인과 지도는 아직 안 된다.** 각 콘솔이 아직
localhost 만 알고 있기 때문이다.

| 서비스 | 어디에 | 넣을 값 |
|---|---|---|
| Google Cloud → OAuth 클라이언트 | 승인된 JavaScript 원본 | `https://whenigo.p-e.kr` |
| Google Cloud → OAuth 클라이언트 | 승인된 리디렉션 URI | `https://whenigo.p-e.kr/api/calendar/callback` |
| Google Cloud → Maps 키 | HTTP 리퍼러 제한 | `https://whenigo.p-e.kr/*` |
| Kakao Developers → 플랫폼 → Web | 사이트 도메인 | `https://whenigo.p-e.kr` |
| Kakao Developers → 카카오 로그인 | Redirect URI | `https://whenigo.p-e.kr/auth/kakao/callback` |
| ODsay 콘솔 | Service URI | `https://whenigo.p-e.kr` |

카카오 리다이렉트 주소는 코드가 접속한 오리진에서 만들어 쓰므로
([src/config.ts](../src/config.ts)) 콘솔에만 등록하면 되고 환경변수는 없다.

## 10. 이후 배포

```bash
sudo -u whenigo /srv/whenigo/deploy/update.sh
```

---

## 알아둘 것

**미국 리전이라 한 박자 느리다.** 무료 e2-micro 는 미국에만 있다.
경로 조회 한 번에 카카오·ODsay·TAGO 를 연달아 부르는데 그 왕복이 전부
태평양을 건너므로, 서울 서버보다 0.5초쯤 더 걸린다. 데모로는 충분하지만
거슬리면 서울 리전 VM(월 $5 안팎)으로 옮기면 된다 —
**3번부터는 문서가 그대로 유효하고, 바꿀 건 DNS 의 IP 한 줄이다.**

**무료 이그레스는 월 1GB 다.** 북미에서 나가는 트래픽 기준이고, 이 앱 번들이
gzip 100KB 남짓이라 월 수천 번 열람까지는 여유롭다. 넘겨도 GB 당 몇백 원이다.

**DB 백업.** `/var/lib/whenigo/app.db` 하나가 전부다. 사라지면 가입자·세션·
저장한 장소가 다 사라진다. cron 으로 복사해 두는 것을 권한다:

```bash
sqlite3 /var/lib/whenigo/app.db ".backup /var/backups/whenigo-$(date +\%F).db"
```

**p-e.kr 무료 도메인의 한계.** Public Suffix List 에 없어서 (a) Let's Encrypt
발급 한도를 다른 사용자와 공유하고 (Caddy 가 실패 시 ZeroSSL 로 넘어가므로
대개는 발급된다), (b) 브라우저가 `p-e.kr` 을 등록 가능 도메인으로 보기 때문에
같은 `p-e.kr` 아래 다른 사이트가 `Domain=p-e.kr` 쿠키를 심어 우리 요청에
섞어 보낼 수 있다. **세션을 훔치지는 못한다** — 쿠키가 `httpOnly` 이고 값이
HMAC 로 서명돼 있어([server/session.ts](../server/session.ts)) 가짜 값은 DB 조회
전에 걸러진다. 다만 같은 이름의 쿠키를 심어 우리 것을 가리면 사용자가 이유 없이
로그아웃될 수 있다. 진짜 서비스로 갈 거면 직접 산 도메인으로 옮기는 게 맞다.
