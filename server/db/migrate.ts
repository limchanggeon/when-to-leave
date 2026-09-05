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
