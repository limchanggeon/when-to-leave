import './timezone'
import { DatabaseSync } from 'node:sqlite'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { serverEnv } from './env'
import { signRequest } from './sigv4'

/**
 * DB 백업.
 *
 * **파일을 그냥 복사하면 안 된다.** WAL 모드라 최신 내용이 app.db 가 아니라
 * app.db-wal 에 있고, 쓰는 도중이면 반쪽짜리를 뜬다. SQLite 가 스스로
 * 정합성 있는 사본을 만들게 한다(VACUUM INTO) — 잠금을 잡고 조각모음까지
 * 해서 하나의 파일로 떨군다.
 *
 * 계정과 비밀번호 해시가 들어 있으므로 0600 으로 둔다.
 */
const DB_PATH = process.env.DB_PATH ?? 'data/app.db'
const DIR = process.env.BACKUP_DIR ?? '/var/backups/whenigo'
/** 남겨둘 개수. 하루 한 번이면 2주치. */
const KEEP = Number(process.env.BACKUP_KEEP ?? 14)

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 정합성 있는 사본을 떠서 gzip 으로 묶는다. */
function snapshot(): { name: string; body: Buffer } {
  const tmp = join(tmpdir(), `whenigo-${process.pid}.db`)
  rmSync(tmp, { force: true })

  const db = new DatabaseSync(DB_PATH, { readOnly: true })
  try {
    // 경로에 작은따옴표가 들어갈 일은 없지만, SQL 문자열이므로 막아둔다
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`)
  } finally {
    db.close()
  }

  const body = gzipSync(readFileSync(tmp), { level: 9 })
  rmSync(tmp, { force: true })
  return { name: `app-${stamp()}.db.gz`, body }
}

/** 오래된 것부터 지운다. 개수로 센다 — 날짜로 세면 서버가 며칠 꺼져 있었을 때 다 날아간다. */
function rotate(): string[] {
  const files = readdirSync(DIR)
    .filter((f) => /^app-\d{8}-\d{4}\.db\.gz$/.test(f))
    .sort()
  const stale = files.slice(0, Math.max(0, files.length - KEEP))
  for (const f of stale) rmSync(join(DIR, f), { force: true })
  return stale
}

/**
 * S3 로 올린다. 설정이 없으면 조용히 건너뛴다.
 *
 * 같은 디스크에만 두면 인스턴스가 통째로 날아갈 때 백업도 같이 날아간다.
 * 여기까지 해야 백업이라고 할 수 있다.
 *
 * SDK 없이 서명해 PUT 한다 — 메일과 같은 sigv4 를 쓴다. 다만 S3 는
 * x-amz-content-sha256 을 **요구하므로** 호출부에서 넣어준다.
 */
async function uploadToS3(name: string, body: Buffer): Promise<string> {
  const bucket = process.env.BACKUP_S3_BUCKET
  if (!bucket) return '건너뜀 (BACKUP_S3_BUCKET 없음)'
  const { awsRegion: region, awsAccessKeyId, awsSecretAccessKey } = serverEnv
  if (!awsAccessKeyId || !awsSecretAccessKey) return '건너뜀 (자격증명 없음)'

  const host = `${bucket}.s3.${region}.amazonaws.com`
  const key = `whenigo/${name}`
  const path = `/${key}`

  const headers = signRequest({
    method: 'PUT',
    path,
    headers: {
      host,
      'content-type': 'application/gzip',
      'x-amz-content-sha256': createHash('sha256').update(body).digest('hex'),
    },
    // 이진 데이터라 Buffer 그대로 넘긴다. 문자열로 바꾸면 해시가 달라져
    // 서명이 통째로 어긋난다.
    body,
    region,
    service: 's3',
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  })

  const res = await fetch(`https://${host}${path}`, { method: 'PUT', headers, body })
  if (!res.ok) return `실패 ${res.status}: ${(await res.text()).slice(0, 200)}`
  return `s3://${bucket}/${key}`
}

async function main() {
  mkdirSync(DIR, { recursive: true, mode: 0o700 })
  const { name, body } = snapshot()
  const dest = join(DIR, name)
  writeFileSync(dest, body, { mode: 0o600 })

  const removed = rotate()
  const kb = (statSync(dest).size / 1024).toFixed(0)
  const s3 = await uploadToS3(name, body)

  console.log(`[backup] ${name} (${kb}KB) → ${dest}`)
  if (removed.length) console.log(`[backup] 오래된 것 ${removed.length}개 정리`)
  console.log(`[backup] 원격: ${s3}`)
}

await main()
