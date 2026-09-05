import './timezone'
import { listUsers, setAdmin } from './admin'
import { findByEmail } from './users'

/**
 * 관리자 세우기·내리기. **서버에서만** 돌린다.
 *
 *   pnpm admin:list
 *   pnpm admin:grant  ckdrjs117@gmail.com
 *   pnpm admin:revoke ckdrjs117@gmail.com
 *
 * 화면에 "첫 관리자 만들기" 를 두지 않는 이유는 간단하다 — 그런 입구가
 * 있으면 그게 곧 뒷문이다. 서버에 들어올 수 있는 사람만 관리자를 세운다.
 *
 * 마지막 관리자를 내리는 것도 막는다. 0명이 되면 화면에서는 아무도 못
 * 들어가고, 되돌리려면 결국 여기로 와야 한다.
 */
const [cmd, email] = process.argv.slice(2)

const table = () => {
  const rows = listUsers()
  if (rows.length === 0) return console.log('계정이 없습니다.')
  console.log('관리자  확인  이메일'.padEnd(40) + '가입')
  for (const u of rows) {
    console.log(
      `  ${u.isAdmin ? '●' : '·'}     ${u.emailVerified ? '✓' : '·'}   ` +
        u.email.padEnd(32) +
        new Date(u.createdAt).toLocaleString('ko-KR'),
    )
  }
}

function fail(msg: string): never {
  console.error(`오류: ${msg}`)
  process.exit(1)
}

if (cmd === 'list') {
  table()
} else if (cmd === 'grant' || cmd === 'revoke') {
  if (!email) fail(`이메일이 필요합니다. 예: pnpm admin:${cmd} you@example.com`)
  const row = findByEmail(email)
  if (!row) fail(`그런 계정이 없습니다: ${email}`)

  if (cmd === 'revoke') {
    const admins = listUsers().filter((u) => u.isAdmin)
    if (admins.length <= 1 && admins[0]?.id === row.id) {
      fail('마지막 관리자입니다. 내리면 화면으로는 아무도 못 들어옵니다.')
    }
  }

  setAdmin(row.id, cmd === 'grant')
  console.log(`${row.email} → ${cmd === 'grant' ? '관리자로 세웠습니다' : '관리자에서 내렸습니다'}`)
  table()
} else {
  console.log('쓰는 법:\n  pnpm admin:list\n  pnpm admin:grant  <이메일>\n  pnpm admin:revoke <이메일>')
  process.exit(cmd ? 1 : 0)
}
