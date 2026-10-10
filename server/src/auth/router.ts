import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { D1Database } from '@cloudflare/workers-types'
import { loginSchema } from '../../../shared/auth'
import { authRepository } from './repository'
import type { AuthRepository } from './repository'
import {
  createToken,
  hashToken,
  verifyPassword,
  DUMMY_PASSWORD,
  SESSION_SECONDS,
} from './model'

type Env = { Bindings: { DB: D1Database } }

const cookieName = 'macho_session'
const cookieOptions = (c: Context<Env>) => ({
  path: '/',
  httpOnly: true,
  secure: new URL(c.req.url).protocol === 'https:',
  sameSite: 'Strict' as const,
})

export function createApp(
  repository: (c: Context<Env>) => AuthRepository = (c) =>
    authRepository(c.env.DB),
) {
  const app = new Hono<Env>()

  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (
      !['GET', 'HEAD'].includes(c.req.method) &&
      c.req.header('Origin') !== new URL(c.req.url).origin
    )
      return c.json({ error: '許可されていないリクエストです。' }, 403)
    await next()
  })

  app.post('/api/auth/login', async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success)
      return c.json(
        { error: 'ログインIDとパスワードを確認してください。' },
        400,
      )
    const repo = repository(c)
    const now = Math.floor(Date.now() / 1000)
    const ip = c.req.header('CF-Connecting-IP') ?? 'local'
    // Count requests atomically before password hashing to bound expensive work.
    const allowedIp = await repo.consumeAttempt(
      await hashToken(`ip:${ip}`),
      now,
    )
    const allowedId = await repo.consumeAttempt(
      await hashToken(`id:${parsed.data.loginId}`),
      now,
    )
    if (!allowedIp || !allowedId) {
      c.header('Retry-After', '900')
      return c.json(
        { error: '試行回数の上限に達しました。15分後に再試行してください。' },
        429,
      )
    }
    const user = await repo.findUser(parsed.data.loginId)
    const valid = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? DUMMY_PASSWORD,
    )
    if (!user || !valid)
      return c.json(
        { error: 'ログインIDまたはパスワードが正しくありません。' },
        401,
      )
    const previous = getCookie(c, cookieName)
    if (previous) await repo.deleteSession(await hashToken(previous))
    const token = createToken()
    await repo.createSession(
      await hashToken(token),
      user.loginId,
      now + SESSION_SECONDS,
    )
    setCookie(c, cookieName, token, {
      ...cookieOptions(c),
      maxAge: SESSION_SECONDS,
    })
    return c.json({ user: { loginId: user.loginId } })
  })

  app.get('/api/auth/session', async (c) => {
    const token = getCookie(c, cookieName)
    const session = token
      ? await repository(c).findSession(await hashToken(token))
      : undefined
    if (!session || session.expiresAt <= Math.floor(Date.now() / 1000))
      return c.json({ error: 'ログインしてください。' }, 401)
    return c.json({ user: { loginId: session.loginId } })
  })

  app.post('/api/auth/logout', async (c) => {
    const token = getCookie(c, cookieName)
    if (token) await repository(c).deleteSession(await hashToken(token))
    deleteCookie(c, cookieName, cookieOptions(c))
    return c.json({ ok: true })
  })

  app.notFound((c) => c.json({ error: '見つかりません。' }, 404))

  app.onError((_error, c) =>
    c.json(
      { error: '処理に失敗しました。しばらくしてから再試行してください。' },
      500,
    ),
  )
  return app
}
