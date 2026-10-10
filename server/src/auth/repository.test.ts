import { afterAll, beforeAll, it, expect } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { readFileSync } from 'node:fs'
import type { D1Database } from '@cloudflare/workers-types'
import { authRepository } from './repository'
import { createApp } from './router'
import { hashPassword } from './model'
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    compatibilityDate: '2026-10-10',
    script: 'export default { fetch() { return new Response() } }',
    d1Databases: { DB: 'auth-test' },
  }),
)
let db: D1Database
beforeAll(async () => {
  db = (await runtime.getD1Database('DB')) as unknown as D1Database
  const migration = readFileSync(
    'server/migrations/0000_cynical_nuke.sql',
    'utf8',
  )
  await db.batch(
    migration
      .split('--> statement-breakpoint')
      .filter((s) => s.trim())
      .map((sql) => db.prepare(sql)),
  )
  await db
    .prepare('INSERT INTO users (login_id,password_hash) VALUES (?,?)')
    .bind('tester', await hashPassword('training-password'))
    .run()
})
afterAll(async () => {
  await runtime.dispose()
})
it('enforces the attempt limit atomically and resets it after the window', async () => {
  const repo = authRepository(db)
  const results = await Promise.all(
    Array.from({ length: 15 }, () => repo.consumeAttempt('shared-key', 100)),
  )
  expect(results.filter(Boolean)).toHaveLength(10)
  expect(await repo.consumeAttempt('shared-key', 1000)).toBe(true)
})
it('does not restore expired sessions', async () => {
  const repo = authRepository(db)
  await repo.createSession('expired', 'tester', 1)
  expect(await repo.findSession('expired')).toBeUndefined()
})
it('logs in and logs out against actual D1 storage', async () => {
  const app = createApp(() => authRepository(db))
  const response = await app.request('https://example.com/api/auth/login', {
    method: 'POST',
    headers: {
      Origin: 'https://example.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ loginId: 'tester', password: 'training-password' }),
  })
  expect(response.status).toBe(200)
  const headers = {
    Cookie: response.headers.get('set-cookie')!.split(';')[0],
    Origin: 'https://example.com',
  }
  expect(
    (await app.request('https://example.com/api/auth/session', { headers }))
      .status,
  ).toBe(200)
  expect(
    (
      await app.request('https://example.com/api/auth/logout', {
        method: 'POST',
        headers,
      })
    ).status,
  ).toBe(200)
  expect(
    (await app.request('https://example.com/api/auth/session', { headers }))
      .status,
  ).toBe(401)
})
