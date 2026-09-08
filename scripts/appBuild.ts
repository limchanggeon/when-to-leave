/**
 * 앱용 웹 자산을 만들어 안드로이드 프로젝트에 넣는다.
 *
 *   pnpm app:build                 → .env 의 APP_API_BASE 를 쓴다
 *   APP_API_BASE=… pnpm app:build  → 그때만 다른 서버를 본다
 *
 * 웹 빌드(`pnpm build`)와 갈라둔 이유: 앱에는 **서버 주소가 박혀 나간다.**
 * 웹은 자기 주소로 부르면 되지만(그래서 값이 비어야 한다), 앱 안의 화면은
 * 기기에 들어 있어서 어디로 물어볼지 적어줘야 한다. 두 빌드가 한 명령을
 * 쓰면 언젠가 웹에 주소가 박히거나 앱에 안 박힌다.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const fromEnvFile = (): string | undefined => {
  if (!existsSync('.env')) return undefined
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*APP_API_BASE\s*=\s*(.*)$/.exec(line)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

const base = process.env.APP_API_BASE || fromEnvFile()

if (!base) {
  console.error(
    '앱이 어느 서버를 볼지 정해야 합니다.\n' +
      '  .env 에 APP_API_BASE=https://… 를 넣거나\n' +
      '  APP_API_BASE=https://… pnpm app:build 로 한 번만 지정하세요.\n\n' +
      '이 값은 앱 안에 박혀 나갑니다. 나중에 바꾸려면 앱을 다시 올려야 합니다.',
  )
  process.exit(1)
}

if (!/^https:\/\//.test(base)) {
  // http 로 두면 안드로이드가 평문 통신을 막아 앱이 조용히 아무것도 못 한다
  console.error(`APP_API_BASE 는 https 여야 합니다: ${base}`)
  process.exit(1)
}

console.log(`앱이 볼 서버: ${base}`)
const run = (cmd: string, args: string[], env?: Record<string, string>) =>
  execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })

run('pnpm', ['build'], { VITE_API_BASE: base })
run('pnpm', ['exec', 'cap', 'sync', 'android'])
