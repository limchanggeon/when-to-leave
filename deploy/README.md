# 배포

프론트엔드와 API 를 **한 서버, 한 주소**로 올린다. Express 가 `dist/` 를 직접
서빙하므로 CORS 설정이 필요 없고, 세션 쿠키(`sameSite: 'lax'`)가 그대로 동작한다.

```
브라우저 → Caddy(443, TLS) → Express(127.0.0.1:8787) → SQLite(/var/lib/whenigo/app.db)
                                        └ dist/ 정적 파일
```

설치는 [`bootstrap.sh`](bootstrap.sh) 한 줄이 다 한다. 사람이 할 일은 셋뿐이다 —
**VM 만들기 → 스크립트 실행 → 키와 DNS 채우기.**

---

## 1. 우분투 VM 한 대

어느 클라우드든 상관없다. 스크립트는 우분투이기만 하면 똑같이 동작한다.
고민되면 아래 둘 중 하나.

### GCP — 공짜, 대신 미국

Compute Engine → 인스턴스 만들기. **무료 한도를 지키려면 네 가지를 정확히
골라야 한다.** 하나라도 어긋나면 과금이 시작된다.

| 항목 | 값 | 왜 |
|---|---|---|
| 리전 | **us-west1 (오리건)** | 무료는 us-west1 / us-central1 / us-east1 뿐. 그중 한국에서 가장 가깝다 |
| 머신 유형 | **e2-micro** | 이것만 무료. e2-small 부터 과금 |
| 부팅 디스크 이미지 | Ubuntu 26.04 LTS | |
| 부팅 디스크 **유형** | **표준 영구 디스크**, 30GB | 기본값인 균형 있는(Balanced) 디스크는 **무료가 아니다** |

방화벽에서 **HTTP 트래픽 허용 / HTTPS 트래픽 허용**을 둘 다 체크.
만든 뒤 VPC 네트워크 → IP 주소에서 외부 IP 를 **임시 → 고정으로 예약**한다.
안 하면 재시작 때 주소가 바뀌어 도메인이 깨진다.

무료 한도는 바뀔 수 있으니 확인: <https://cloud.google.com/free/docs/free-cloud-features>

### AWS Lightsail — 월 $5, 대신 서울

인스턴스 생성 → 리전 **서울(ap-northeast-2)** → Linux/Unix → OS 전용 →
**Ubuntu** → $5 플랜. 첫 3개월 무료.

만든 뒤 **네트워킹 탭에서 고정 IP 연결**, 그리고 방화벽에 **HTTP(80)** 과
**HTTPS(443)** 규칙 추가.

> S3 나 Amplify 같은 정적 웹 호스팅으로는 안 된다. 파일만 내보내는 서비스라
> Node 서버와 SQLite 가 돌 곳이 없다.

## 2. 스크립트 한 줄

저장소가 **비공개**라 스크립트를 VM 으로 옮기는 방법이 갈린다.

### 가장 쉬운 길 — 저장소를 공개로

```bash
gh repo edit limchanggeon/when-to-leave --visibility public --accept-visibility-change-consequences
```

코드에 비밀값은 없다. `.env` 는 `.gitignore` 에 있어 올라간 적이 없고
`.env.example` 은 빈 껍데기다. 공개로 돌리면 VM 에서 이 한 줄이면 끝난다:

```bash
curl -fsSLO https://raw.githubusercontent.com/limchanggeon/when-to-leave/main/deploy/bootstrap.sh
sudo DOMAIN=whenigo.p-e.kr \
     REPO=https://github.com/limchanggeon/when-to-leave.git \
     bash bootstrap.sh
```

### 비공개로 두겠다면 — 맥에서 올려보내기

먼저 스크립트를 VM 으로 복사한다.

```bash
# GCP
gcloud compute scp deploy/bootstrap.sh <인스턴스이름>:~ --zone <존>

# Lightsail / EC2
scp -i <키.pem> deploy/bootstrap.sh ubuntu@<서버IP>:~
```

그리고 VM 에서:

```bash
sudo DOMAIN=whenigo.p-e.kr \
     REPO=git@github.com:limchanggeon/when-to-leave.git \
     bash bootstrap.sh
```

**배포 키를 한 번 등록해야 한다.** 스크립트가 키를 만들어 화면에 뿌리고 멈추므로,
그 한 줄을 GitHub → 저장소 → Settings → Deploy keys 에 붙여넣고
(쓰기 권한 불필요) 같은 명령을 다시 실행하면 이어서 진행된다.

---

스크립트가 하는 일: 스왑 · Node(22.5+ 확인, 낮으면 설치) · pnpm · 앱 사용자 ·
clone · 빌드 · `/etc/whenigo.env` 생성(SESSION_SECRET 은 새로 뽑는다) ·
systemd 등록 · Caddy 설치와 도메인 설정. **여러 번 돌려도 안전하다.**

끝나면 남은 일과 서버 IP 를 화면에 알려준다.

### 키 채우기

```bash
sudo nano /etc/whenigo.env      # 카카오·구글·ODsay·TAGO 키
sudo systemctl restart whenigo
curl -s http://127.0.0.1:8787/api/health
```

`VITE_` 로 시작하는 값은 여기가 아니라 **빌드하는 쪽**(`/srv/whenigo/.env`)에
있어야 한다. 빌드 시점에 번들로 들어가기 때문이다.

### DNS

`whenigo.p-e.kr` 관리 화면 → **고급설정(DNS)** → **IP연결(A)**:
앞 입력칸은 **비워두고**(비워야 도메인 자체를 가리킨다), 값에 서버의 고정 IP.

**웹포워딩은 쓰지 않는다.** 다른 주소로 튕겨주는 기능이라 주소창에 도메인이
남지 않고 쿠키·HTTPS 가 어긋난다.

```bash
dig +short whenigo.p-e.kr     # 서버 IP 가 나오면 반영된 것
journalctl -u caddy -f        # 인증서가 자동으로 발급된다
```

## 3. 콘솔에 새 주소 등록

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

## 4. 이후 배포

```bash
sudo /srv/whenigo/deploy/update.sh
```

---

## 알아둘 것

**미국 리전을 골랐다면 한 박자 느리다.** 경로 조회 한 번에 카카오·ODsay·TAGO 를
연달아 부르는데 그 왕복이 전부 태평양을 건너므로, 서울 서버보다 0.5초쯤 더 걸린다.
데모로는 충분하고, 거슬리면 서울 VM 을 새로 만들어 bootstrap 을 다시 돌리면 된다.
**바꿀 건 DNS 의 IP 한 줄이다.**

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
