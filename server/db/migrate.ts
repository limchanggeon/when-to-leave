import type { DatabaseSync } from 'node:sqlite'

/**
 * 마이그레이션. 번호를 붙여 순서대로 한 번씩만 돌린다.
 * 이미 적용된 것은 schema_migrations 에 기록해 건너뛴다.
 */
interface Migration {
  id: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'users, identities, sessions, places',
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        -- 소셜로만 가입한 계정은 비밀번호가 없다
        password_hash TEXT,
        name          TEXT,
        avatar_url    TEXT,
        created_at    INTEGER NOT NULL
      );

      -- 소셜 계정 연결. 같은 이메일이면 한 사용자에 여러 제공자가 붙는다.
      CREATE TABLE identities (
        provider         TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at       INTEGER NOT NULL,
        PRIMARY KEY (provider, provider_user_id)
      );
      CREATE INDEX idx_identities_user ON identities(user_id);

      CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      -- 저장된 장소. "집" 같은 말을 좌표로 풀어주는 자리다 —
      -- 지금은 그런 말을 장소 검색에 넘기지 않고 거절하고 있다.
      CREATE TABLE places (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label      TEXT NOT NULL,
        name       TEXT NOT NULL,
        lat        REAL NOT NULL,
        lng        REAL NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, label)
      );
    `,
  },
  {
    id: 2,
    name: 'google_tokens, trips',
    sql: `
      -- 구글 캘린더 접근 토큰. ID 토큰(로그인)과는 다른 것이다 —
      -- 이건 사용자를 대신해 캘린더에 쓰기 위한 권한이다.
      CREATE TABLE google_tokens (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        access_token  TEXT NOT NULL,
        -- refresh_token 은 최초 동의 때만 온다. 이후 갱신 응답에는 없으므로 보존한다.
        refresh_token TEXT,
        expires_at    INTEGER NOT NULL,
        scope         TEXT NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      -- 계산해서 저장해둔 여정.
      CREATE TABLE trips (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        origin_name       TEXT NOT NULL,
        destination_name  TEXT NOT NULL,
        depart_at         INTEGER NOT NULL,
        arrive_at         INTEGER NOT NULL,
        -- 구간 배열 원본. 스키마가 자주 바뀌는 부분이라 통째로 보관한다.
        legs_json         TEXT NOT NULL,
        -- 캘린더에 넣었다면 그 이벤트 id. 나중에 수정·삭제에 쓴다.
        calendar_event_id TEXT,
        created_at        INTEGER NOT NULL
      );
      CREATE INDEX idx_trips_user ON trips(user_id, depart_at);
    `,
  },
  {
    id: 3,
    name: 'email_verified_at, email_tokens',
    sql: `
      ALTER TABLE users ADD COLUMN email_verified_at INTEGER;

      /*
       * 기존 계정 처리.
       *
       * 소셜로 만든 계정만 인정한다 — 제공자가 주소를 확인해줬고, 우리 코드도
       * 확인된 경우에만 그 주소를 받는다(구글 email_verified, 카카오
       * is_email_verified). 제공자가 주소를 안 줘서 지어낸 @social.local 은
       * 실재하는 주소가 아니므로 제외한다.
       *
       * 비밀번호 계정은 확인한 적이 없으므로 그대로 미인증이다. 지금까지
       * 확인 절차가 없었다고 확인한 셈 칠 수는 없다.
       */
      UPDATE users SET email_verified_at = created_at
      WHERE id IN (SELECT user_id FROM identities)
        AND email NOT LIKE '%@social.local';

      /*
       * 메일로 보내는 한 번짜리 표. 인증과 비밀번호 재설정이 같이 쓴다.
       *
       * token_hash 가 열쇠다 — 원문을 저장하지 않는다. 메일 속 링크는 그
       * 자체가 자격증명이라, 표가 새면 원문이 그대로 남의 계정 열쇠가 된다.
       * (32바이트 난수라 대입할 여지가 없어 SHA-256 이면 충분하다.)
       *
       * email 을 같이 적는 이유: 링크를 누르기 전에 주소를 바꿨다면 옛 링크가
       * 새 주소를 인증해선 안 된다.
       */
      CREATE TABLE email_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        purpose    TEXT NOT NULL,
        email      TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at    INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_email_tokens_user ON email_tokens(user_id, purpose);
      CREATE INDEX idx_email_tokens_expiry ON email_tokens(expires_at);
    `,
  },
  {
    id: 4,
    name: 'is_admin, admin_log',
    sql: `
      ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

      /*
       * 관리자가 한 일. 사람 계정을 지우고 인증을 통과시키는 권한이라,
       * "누가 언제 무엇을 했는지" 가 남지 않으면 사고가 나도 되짚을 수 없다.
       *
       * actor 는 지운 사람이고 target 은 지워진 사람이다. 대상이 지워져도
       * 기록은 남아야 하므로 **외래키를 걸지 않는다** — 걸면 캐스케이드로
       * 같이 사라져서, 정작 알아야 할 때 아무것도 안 남는다.
       * 그래서 이메일도 그 시점 값으로 함께 적어 둔다.
       */
      CREATE TABLE admin_log (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id  TEXT NOT NULL,
        actor_email    TEXT NOT NULL,
        action         TEXT NOT NULL,
        target_user_id TEXT,
        target_email   TEXT,
        detail         TEXT,
        created_at     INTEGER NOT NULL
      );
      CREATE INDEX idx_admin_log_time ON admin_log(created_at DESC);
    `,
  },
  {
    id: 5,
    name: 'daily_counts',
    sql: `
      /*
       * 하루치 집계만 센다. 개별 방문 기록을 남기지 않는다.
       *
       * IP 도 방문자 식별자도 저장하지 않는다 — 대시보드에 필요한 건
       * "어제 몇 번" 이지 "누가" 가 아니다. 남기지 않으면 새지도 않는다.
       *
       * day 는 **한국 날짜**(YYYY-MM-DD)다. 서버가 UTC 라도 timezone.ts 가
       * 시간대를 못 박아 두므로 자정 경계가 사용자 감각과 맞는다.
       */
      CREATE TABLE daily_counts (
        day    TEXT NOT NULL,
        metric TEXT NOT NULL,
        count  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, metric)
      );
    `,
  },
  {
    id: 6,
    name: 'contact_messages',
    sql: `
      /*
       * 문의함.
       *
       * 메일로 전달하는 게 목적이지만 **저장을 먼저 한다.** SES 가 샌드박스라
       * 인증되지 않은 주소로는 못 보내는데, 그때 메일만 시도했다면 보낸 사람은
       * "보냈습니다" 를 보고 우리는 아무것도 못 받는다. 그게 제일 나쁘다.
       * 저장이 성공했으면 문의는 도착한 것이고, 메일은 그걸 알리는 수단일 뿐이다.
       *
       * mail_sent_at 이 null 이면 아직 메일로 못 알렸다는 뜻이다.
       * user_id 는 로그인 상태로 보냈을 때만 채운다(계정이 지워지면 같이 비운다).
       */
      CREATE TABLE contact_messages (
        id           TEXT PRIMARY KEY,
        from_email   TEXT    NOT NULL,
        body         TEXT    NOT NULL,
        user_id      TEXT    REFERENCES users(id) ON DELETE SET NULL,
        created_at   INTEGER NOT NULL,
        mail_sent_at INTEGER,
        mail_error   TEXT,
        read_at      INTEGER
      );
      CREATE INDEX idx_contact_created ON contact_messages (created_at DESC);
    `,
  },
  {
    id: 7,
    name: 'approved_at',
    sql: `
      /*
       * 관리자 승인.
       *
       * 원래는 메일 링크를 눌러야 계정이 열렸는데, SES 가 아직 샌드박스라
       * 인증되지 않은 주소로는 메일이 나가지 않는다. 그동안은 사람이
       * 하나씩 승인한다.
       *
       * 메일 인증을 **대신하는** 것이지 더하는 게 아니다. 로그인은
       * "주소가 확인됐거나 승인됐으면" 열린다 — 사람이 눈으로 본 것이
       * 링크 한 번 누른 것보다 약할 이유가 없다. 그래서 샌드박스가
       * 풀려도 이 열은 그대로 쓸 수 있다.
       */
      ALTER TABLE users ADD COLUMN approved_at INTEGER;
      ALTER TABLE users ADD COLUMN approved_by TEXT;
    `,
  },
  {
    id: 8,
    name: 'approve existing users',
    sql: `
      /*
       * 승인은 **가입 방법과 무관하게** 필요하다.
       *
       * 처음에는 소셜로 들어온 사람을 그냥 통과시켰다 — 제공자가 확인해준
       * 주소니 확인된 것으로 쳤다. 그런데 그건 "이 주소가 진짜인가" 에
       * 대한 답이지 "이 사람을 받을 것인가" 에 대한 답이 아니다.
       * 구글·카카오는 로그인 수단이지 입장 허가가 아니다.
       *
       * 이 마이그레이션이 도는 시점에 이미 있던 사람은 그대로 둔다.
       * 안 그러면 관리자 자신이 먼저 잠겨서, 승인해 줄 사람이 사라진다.
       */
      UPDATE users SET approved_at = strftime('%s','now') * 1000, approved_by = 'migration:8'
       WHERE approved_at IS NULL;
    `,
  },
  {
    id: 9,
    name: 'tiers',
    sql: `
      /*
       * 등급과 하루 조회 수.
       *
       * 무료로 쓰는 사람에게도 하루 몇 번은 열어준다. 대신 그 이상은
       * 후원한 사람에게 준다 — 카카오·TAGO 호출과 서버가 공짜가 아니다.
       *
       * 등급 이름만 저장하고 **몇 번까지인지는 코드에 둔다**(server/tiers.ts).
       * 숫자를 행마다 박아두면 정책을 바꿀 때 모든 행을 고쳐야 하고,
       * 사람마다 다른 숫자가 조용히 생긴다.
       */
      ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';

      /*
       * 사람별 하루 조회 수.
       *
       * **무엇을 검색했는지는 담지 않는다.** 몇 번 했는지만 센다 —
       * 한도를 재는 데 필요한 건 그것뿐이다. 개인정보처리방침에도 그렇게 적는다.
       *
       * day 는 한국 날짜(YYYY-MM-DD). 서버가 UTC 라도 timezone.ts 가
       * 시간대를 못 박아 자정 경계가 사용자 감각과 맞는다.
       */
      CREATE TABLE user_daily_searches (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day     TEXT NOT NULL,
        count   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      );

      /*
       * 등급을 올려달라는 요청. 후원한 사람이 누른다.
       *
       * 깃허브 스폰서와 우리 계정을 자동으로 잇는 길이 없다(웹훅을 붙이려면
       * 깃허브 앱과 공개 엔드포인트가 필요하다). 그래서 사람이 확인한다 —
       * 요청에 적힌 깃허브 아이디를 스폰서 목록과 맞춰보고 올려준다.
       */
      CREATE TABLE tier_requests (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note       TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        handled_at INTEGER,
        handled_by TEXT
      );
      CREATE INDEX idx_tier_req_open ON tier_requests (handled_at, created_at DESC);
    `,
  },
]

export function migrate(conn: DatabaseSync): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set(
    (conn.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => r.id),
  )

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue
    conn.exec('BEGIN')
    try {
      conn.exec(m.sql)
      conn
        .prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
        .run(m.id, m.name, Date.now())
      conn.exec('COMMIT')
      console.log(`[db] 마이그레이션 ${m.id} 적용: ${m.name}`)
    } catch (e) {
      conn.exec('ROLLBACK')
      throw e
    }
  }
}
