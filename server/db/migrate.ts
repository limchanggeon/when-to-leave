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
