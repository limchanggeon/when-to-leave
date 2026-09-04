# 배포 — Oracle Cloud 상시 무료 VM

프론트엔드와 API 를 **한 서버, 한 주소**로 올린다. Express 가 `dist/` 를 직접
서빙하므로 CORS 설정이 필요 없고, 세션 쿠키(`sameSite: 'lax'`)가 그대로 동작한다.

```
브라우저 → Caddy(443, TLS) → Express(127.0.0.1:8787) → SQLite(/var/lib/whenigo/app.db)
                                        └ dist/ 정적 파일
```

---

## 1. 인스턴스 만들기

Oracle Cloud 콘솔 → Compute → Instances → Create.

- **Image**: Ubuntu 24.04
- **Shape**: `VM.Standard.A1.Flex` (ARM, 상시 무료 4 OCPU / 24GB) 를 먼저 시도.
  용량 부족으로 거절되면 `VM.Standard.E2.1.Micro` (1 OCPU / 1GB) 로.
- SSH 공개키 등록하고 생성. **Public IP 를 적어둔다.**

> E2.1.Micro(1GB) 를 골랐다면 `pnpm build` 가 메모리 부족으로 죽을 수 있다.
> 아래 3번에서 스왑을 먼저 잡는다.

## 2. 방화벽 — 두 군데를 다 열어야 한다

오라클은 방화벽이 **두 겹**이다. 한쪽만 열고 왜 안 되는지 헤매는 일이 흔하다.

**(a) VCN Security List** — 콘솔에서:
Networking → Virtual Cloud Networks → 해당 VCN → Security Lists → Default →
Add Ingress Rules 로 두 줄 추가.

| Source | Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**(b) 인스턴스 안의 iptables** — 오라클 우분투 이미지는 22번 말고 전부 막아둔다:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. 기본 세팅

```bash
sudo apt-get update && sudo apt-get install -y git curl

# 메모리 1GB 짜리를 골랐다면 스왑부터. 빌드가 OOM 으로 죽는 걸 막는다.
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Node 24 — node:sqlite 가 Node 22.5+ 를 요구한다
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm i -g pnpm
node -v   # v24.x 인지 확인
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
> 번들에 박히므로 **빌드하는 쪽**(로컬 또는 VM 의 `.env`)에 있어야 한다.

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
- 값: VM 의 Public IP
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

**DB 백업.** `/var/lib/whenigo/app.db` 하나가 전부다. 사라지면 가입자·세션·
저장한 장소가 다 사라진다. cron 으로 복사해 두는 것을 권한다:

```bash
sqlite3 /var/lib/whenigo/app.db ".backup /var/backups/whenigo-$(date +\%F).db"
```

**p-e.kr 무료 도메인의 한계.** Public Suffix List 에 없어서 (a) Let's Encrypt
발급 한도를 다른 사용자와 공유하고, (b) 브라우저가 `p-e.kr` 을 등록 가능
도메인으로 보기 때문에 같은 `p-e.kr` 아래 다른 사이트가 `Domain=p-e.kr` 쿠키를
심어 우리 요청에 섞어 보낼 수 있다. **세션을 훔치지는 못한다** — 쿠키가
`httpOnly` 이고 값이 HMAC 로 서명돼 있어([server/session.ts](../server/session.ts))
가짜 값은 DB 조회 전에 걸러진다. 다만 같은 이름의 쿠키를 심어 우리 쿠키를
가리면 사용자가 이유 없이 로그아웃될 수 있다. 진짜 서비스로 갈 거면
직접 산 도메인으로 옮기는 게 맞다.
