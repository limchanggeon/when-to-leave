import './timezone'
import { randomUUID } from 'node:crypto'
import { db } from './db/index'
import { hashPassword, checkPassword } from './password'
import { setAdmin } from './admin'
import { findByEmail } from './users'

/**
 * 비밀번호로 들어오는 관리자 계정을 만든다. **서버에서만** 돌린다.
 *
 *   pnpm admin:create <아이디> <비밀번호>
 *
 * 화면의 가입은 이메일을 요구하지만 여기는 아니다 — 로그인은 이 값을 그냥
 * 문자열로 찾으므로 `admin` 같은 아이디도 된다. 메일을 보낼 일이 없는
 * 계정이라 주소일 필요도 없다.
 *
 * **비밀번호 규칙을 건너뛸 수 있다**(`--force`). 화면 가입에는 규칙이
 * 그대로 걸리고, 여기서만 열어둔다. 서버에 들어올 수 있는 사람이 스스로
 * 정하는 값이라 막을 자리가 아니다. 다만 무엇을 넘겼는지는 말해준다 —
 * 모르고 약한 것을 쓰는 일은 없어야 한다.
 *
 * 만든 계정은 바로 승인된 상태로 둔다. 메일 인증을 못 받는 아이디라
 * 승인을 기다리게 하면 영영 못 들어온다.
 */
const args = process.argv.slice(2)
const force = args.includes('--force')
const [id, password] = args.filter((a) => a !== '--force')

if (!id || !password) {
  console.error('사용법: pnpm admin:create <아이디> <비밀번호> [--force]')
  process.exit(1)
}

const problem = checkPassword(password)
if (problem && !force) {
  console.error(`✗ 비밀번호가 규칙에 걸립니다: ${problem.message}`)
  console.error('  그래도 쓰려면 뒤에 --force 를 붙이세요.')
  process.exit(1)
}
if (problem) {
  console.warn(`⚠ 규칙을 건너뜁니다: ${problem.message}`)
}

const conn = db()
const existing = findByEmail(id)
const hash = await hashPassword(password)
const now = Date.now()

if (existing) {
  conn
    .prepare('UPDATE users SET password_hash = ?, approved_at = ?, approved_by = ? WHERE id = ?')
    .run(hash, now, 'admin:create', existing.id)
  console.log(`기존 계정 "${id}" 의 비밀번호를 바꾸고 승인했습니다.`)
} else {
  conn
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, avatar_url, created_at, approved_at, approved_by)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(randomUUID(), id.trim().toLowerCase(), hash, '관리자', now, now, 'admin:create')
  console.log(`계정 "${id}" 를 만들었습니다.`)
}

const row = findByEmail(id)
if (!row) {
  console.error('만든 계정을 다시 찾지 못했습니다.')
  process.exit(1)
}
setAdmin(row.id, true)
console.log('관리자로 세웠습니다. 로그인 화면에서 이 아이디로 들어갈 수 있습니다.')
