import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from '../server/src/auth/model.ts'
import { loginIdSchema, newPasswordSchema } from '../shared/auth.ts'

const [command, ...args] = process.argv.slice(2)
const remote = args.includes('--remote')
const local = args.includes('--local')
if (
  args.some(
    (arg) => arg.startsWith('--') && !['--local', '--remote'].includes(arg),
  )
) {
  console.error('対象は --local または --remote で指定してください。')
  process.exit(1)
}
const id = args.find((arg) => !arg.startsWith('--'))
if (
  remote === local ||
  !['create', 'reset-password', 'list'].includes(command) ||
  (command !== 'list' && !loginIdSchema.safeParse(id).success)
) {
  console.error(
    'Usage: npm run user -- <create|reset-password|list> [id] <--local|--remote>',
  )
  process.exit(1)
}

if (remote && !existsSync('.wrangler.production.json')) {
  console.error('本番操作の前に npm run deploy:prepare を実行してください。')
  process.exit(1)
}

const configArgs = remote ? ['--config', '.wrangler.production.json'] : []

function hiddenInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('対話端末から実行してください。')
  process.stdout.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    function finish() {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdin.off('data', receive)
      process.stdout.write('\n')
    }
    function receive(chunk: string) {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish()
          reject(new Error('操作を中止しました。'))
          return
        }
        if (char === '\r' || char === '\n') {
          finish()
          resolve(value)
          return
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1)
        else if (char >= ' ') value += char
      }
    }
    process.stdin.on('data', receive)
  })
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
try {
  console.log(`操作対象: ${remote ? '本番 (remote)' : 'ローカル (local)'}`)
  if (command === 'reset-password') {
    const check = spawnSync(
      'node_modules/.bin/wrangler',
      [
        'd1',
        'execute',
        'macho-man',
        remote ? '--remote' : '--local',
        ...configArgs,
        '--command',
        `SELECT login_id FROM users WHERE login_id=${quote(id!)};`,
        '--json',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          WRANGLER_LOG: 'log',
          WRANGLER_LOG_SANITIZE: 'true',
          WRANGLER_SEND_METRICS: 'false',
        },
      },
    )
    if (check.status !== 0) throw new Error('ユーザーを確認できませんでした。')
    if (
      !JSON.parse(check.stdout).some(
        (batch: { results?: { login_id: string }[] }) =>
          batch.results?.some((row) => row.login_id === id),
      )
    )
      throw new Error('指定されたユーザーが存在しません。')
  }
  let sql = 'SELECT login_id FROM users ORDER BY login_id;'
  if (command !== 'list') {
    const password = await hiddenInput('パスワード（4〜1024文字）: ')
    if (!newPasswordSchema.safeParse(password).success)
      throw new Error('パスワードは4〜1024文字で指定してください。')
    if (password !== (await hiddenInput('確認: ')))
      throw new Error('パスワードが一致しません。')
    const hash = await hashPassword(password)
    sql =
      command === 'create'
        ? `INSERT INTO users (login_id, password_hash) VALUES (${quote(id!)}, ${quote(hash)});`
        : `BEGIN TRANSACTION; UPDATE users SET password_hash=${quote(hash)} WHERE login_id=${quote(id!)}; DELETE FROM sessions WHERE login_id=${quote(id!)}; COMMIT;`
  }
  const directory = mkdtempSync(join(tmpdir(), 'macho-user-'))
  try {
    const file = join(directory, 'operation.sql')
    writeFileSync(file, sql, { mode: 0o600 })
    const result = spawnSync(
      'node_modules/.bin/wrangler',
      [
        'd1',
        'execute',
        'macho-man',
        remote ? '--remote' : '--local',
        ...configArgs,
        ...(command === 'list' ? ['--command', sql] : ['--file', file]),
        '--json',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          WRANGLER_LOG: 'log',
          WRANGLER_LOG_SANITIZE: 'true',
          WRANGLER_LOG_PATH: join(directory, 'wrangler.log'),
          WRANGLER_SEND_METRICS: 'false',
        },
      },
    )
    if (result.status !== 0)
      throw new Error(
        'DB操作に失敗しました。対象DB・マイグレーション・IDの重複を確認してください。',
      )
    if (command === 'list') {
      const results = JSON.parse(result.stdout)
      for (const batch of results)
        for (const row of batch.results ?? []) console.log(row.login_id)
    } else console.log('操作が完了しました。')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '操作に失敗しました。')
  process.exitCode = 1
}
