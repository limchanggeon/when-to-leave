import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrate } from './migrate'

/**
 * SQLite. Node 내장 모듈이라 의존성도 네이티브 빌드도 없다.
 *
 * 한 프로세스에서 한 파일을 쓰는 구조라 단일 서버까지는 충분하다.
 * 인스턴스를 여러 대 띄우게 되면 Postgres 로 옮겨야 하는데,
 * 그때 바꿀 곳이 이 파일과 쿼리들뿐이도록 SQL 을 표준에 가깝게 썼다.
 */
const DB_PATH = process.env.DB_PATH ?? 'data/app.db'

let instance: DatabaseSync | null = null

export function db(): DatabaseSync {
  if (instance) return instance

  mkdirSync(dirname(DB_PATH), { recursive: true })
  const conn = new DatabaseSync(DB_PATH)

  // 외래키를 켜야 참조 무결성이 실제로 지켜진다(SQLite 는 기본 꺼짐).
  conn.exec('PRAGMA foreign_keys = ON')
  // 읽기와 쓰기가 서로를 막지 않게 한다.
  conn.exec('PRAGMA journal_mode = WAL')

  migrate(conn)
  instance = conn
  return conn
}

export function closeDb(): void {
  instance?.close()
  instance = null
}
