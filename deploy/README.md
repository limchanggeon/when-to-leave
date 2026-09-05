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

<https://lightsail.aws.amazon.com/> → 우측 상단 리전이 **서울(ap-northeast-2)**
인지 확인 → **인스턴스 생성**

| 항목 | 값 |
|---|---|
| 인스턴스 위치 | 서울, 가용 영역 A |
| 플랫폼 | Linux/Unix |
| 블루프린트 | **OS 전용** → Ubuntu (최신 LTS) |
| 플랜 | **$5/월** (1GB RAM). 첫 3개월 무료 |
| 이름 | `whenigo` |

만든 뒤 인스턴스 → **네트워킹** 탭에서 두 가지:

1. **고정 IP 생성**해서 이 인스턴스에 연결 (붙어 있는 동안은 무료)
2. IPv4 방화벽에 **HTTP(80)** 과 **HTTPS(443)** 규칙 추가

블루프린트가 Ubuntu 24.04 여도 상관없다. 기본 Node 가 18 이라 부족하지만
bootstrap 이 알아서 NodeSource 로 올린다.

> S3 나 Amplify 같은 정적 웹 호스팅으로는 안 된다. 파일만 내보내는 서비스라
> Node 서버와 SQLite 가 돌 곳이 없다.

## 2. 스크립트 한 줄

저장소가 **비공개**라 스크립트를 VM 으로 옮기는 방법이 갈린다.

> **저장소를 공개로 돌리지 말 것.** 초기 커밋(`710ebb5`)의 `.env.example` 에
> 브라우저용 키 두 개(`VITE_KAKAO_JS_KEY`, `VITE_GOOGLE_MAPS_KEY`)가 값째로
> 들어갔다가 나중에 지워졌다. 파일에서는 지웠지만 **히스토리에는 남아 있다.**
> 서버 비밀값(client_secret·ODsay·TAGO)은 커밋된 적이 없다.

### 맥에서 스크립트를 올려보낸다

먼저 스크립트를 VM 으로 복사한다.

```bash
# Lightsail — 계정 → SSH 키 에서 기본 키를 내려받아 두고
chmod 400 ~/Downloads/LightsailDefaultKey-ap-northeast-2.pem
scp -i ~/Downloads/LightsailDefaultKey-ap-northeast-2.pem \
    deploy/bootstrap.sh ubuntu@<고정IP>:~

# GCP
gcloud compute scp deploy/bootstrap.sh <인스턴스이름>:~ --zone <존>
```

그리고 VM 에서:

```bash
ssh -i ~/Downloads/LightsailDefaultKey-ap-northeast-2.pem ubuntu@<고정IP>

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

**두 파일에 같이 넣어야 하는 값이 하나 있다: `GOOGLE_CLIENT_ID`.**
서버는 ID 토큰의 `aud` 를 확인하려고 이 값을 읽는데, 프로세스는
`/etc/whenigo.env` 만 본다. 코드에 `VITE_GOOGLE_CLIENT_ID` 대체가 있지만
그건 두 값이 한 파일에 있는 로컬에서만 걸린다. 운영에서 빠뜨리면 로컬에서
멀쩡하던 구글 로그인이 여기서만 죽고, 화면에는 "GOOGLE_CLIENT_ID 가 서버에
없습니다" 가 뜬다. `/api/health` 의 `missingEnv` 가 이걸 알려준다.

```bash
# 빌드용 .env 에 있는 공개 값을 그대로 서버 쪽에도 넣는다
CID=$(sudo grep -E '^VITE_GOOGLE_CLIENT_ID=' /srv/whenigo/.env | cut -d= -f2-)
printf 'GOOGLE_CLIENT_ID=%s\n' "$CID" | sudo tee -a /etc/whenigo.env > /dev/null
sudo systemctl restart whenigo
```

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


## 백업과 복원

매일 **한국시간 새벽 4시**에 `whenigo-backup.timer` 가 돈다.
`/var/backups/whenigo/app-YYYYMMDD-HHmm.db.gz` 로 14개까지 남는다.

```bash
sudo systemctl start whenigo-backup      # 지금 한 번
journalctl -u whenigo-backup -n 20       # 결과 보기
systemctl list-timers whenigo-backup     # 다음 실행
sudo ls -l /var/backups/whenigo/
```

**파일을 그냥 복사하지 않는다.** WAL 모드라 최신 내용이 `app.db` 가 아니라
`app.db-wal` 에 있어서, 복사만 하면 반쪽을 뜬다. `VACUUM INTO` 로 SQLite 가
스스로 정합성 있는 사본을 만들게 한다.

### 복원

```bash
# 1. 서버를 멈춘다. 켜둔 채로 파일을 갈아끼우면 WAL 과 어긋난다.
sudo systemctl stop whenigo

# 2. 지금 것을 옆으로 치운다 — 복원이 잘못됐을 때 돌아올 자리
sudo mv /var/lib/whenigo/app.db /var/lib/whenigo/app.db.before-restore

# 3. 백업을 푼다. WAL·SHM 은 지운다(옛 DB 의 것이라 섞이면 깨진다)
sudo rm -f /var/lib/whenigo/app.db-wal /var/lib/whenigo/app.db-shm
sudo -u whenigo bash -c 'gunzip -c /var/backups/whenigo/app-20260905-0400.db.gz \
  > /var/lib/whenigo/app.db'

# 4. 확인하고 나서 켠다
sudo -u whenigo node -e "
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('/var/lib/whenigo/app.db', { readOnly: true })
  console.log(db.prepare('PRAGMA integrity_check').get())
  console.log('users', db.prepare('SELECT COUNT(*) c FROM users').get().c)"
sudo systemctl start whenigo
curl -fsS http://127.0.0.1:8787/api/health
```

### 원격 보관 (아직 안 켰다)

지금은 **같은 디스크에만** 있다. 인스턴스가 통째로 날아가면 백업도 같이
날아간다. S3 로 올리려면 버킷을 만들고 `/etc/whenigo.env` 에 한 줄 넣으면 된다.

```
BACKUP_S3_BUCKET=만든-버킷-이름
```

자격증명은 메일용(`AWS_ACCESS_KEY_ID`)을 같이 쓴다. 다만 그 IAM 사용자에게
`s3:PutObject` 권한을 그 버킷에만 더해줘야 한다.

```json
{ "Effect": "Allow", "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::만든-버킷-이름/whenigo/*" }
```

버킷은 **비공개**로 두고 버전 관리를 켜둘 것. 백업 파일에는 계정 이메일과
비밀번호 해시가 들어 있다.
