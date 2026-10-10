import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, hashToken } from './model'
import { createApp } from './router'

describe('password protection', () => {
  it('uses independent salts and rejects incorrect passwords', async () => {
    const a = await hashPassword('training-password')
    const b = await hashPassword('training-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('training-password', a)).toBe(true)
    expect(await verifyPassword('wrong-password', a)).toBe(false)
    expect(await hashToken('token')).not.toContain('token')
  })
})
describe('authentication API', () => {
  const sessions = new Map<string, { loginId: string; expiresAt: number }>()
  const repo = {
    findUser: async (id: string) =>
      id === 'tester'
        ? { loginId: id, passwordHash: await hashPassword('training-password') }
        : undefined,
    consumeAttempt: async () => true,
    createSession: async (hash: string, loginId: string, expiresAt: number) => {
      sessions.set(hash, { loginId, expiresAt })
    },
    findSession: async (hash: string) => sessions.get(hash),
    deleteSession: async (hash: string) => {
      sessions.delete(hash)
    },
  }
  const app = createApp(() => repo)
  const post = (path: string, body = {}) =>
    app.request(`https://example.com/api/auth/${path}`, {
      method: 'POST',
      headers: {
        Origin: 'https://example.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  it('rejects cross-origin login before accessing storage', async () => {
    expect(
      (
        await app.request('https://example.com/api/auth/login', {
          method: 'POST',
          headers: { Origin: 'https://evil.test' },
        })
      ).status,
    ).toBe(403)
  })
  it('returns the same error for missing users and wrong passwords', async () => {
    const a = await post('login', {
      loginId: 'unknown',
      password: 'training-password',
    })
    const b = await post('login', { loginId: 'tester', password: 'incorrect' })
    expect(a.status).toBe(401)
    expect(await a.json()).toEqual(await b.json())
  })
  it('issues a protected cookie, restores the session, and revokes it on logout', async () => {
    const response = await post('login', {
      loginId: 'tester',
      password: 'training-password',
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    const headers = {
      Cookie: cookie.split(';')[0],
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
  it('limits login attempts', async () => {
    const limited = createApp(() => ({
      ...repo,
      consumeAttempt: async () => false,
    }))
    expect(
      (
        await limited.request('https://example.com/api/auth/login', {
          method: 'POST',
          headers: {
            Origin: 'https://example.com',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            loginId: 'tester',
            password: 'training-password',
          }),
        })
      ).status,
    ).toBe(429)
  })
})

it('compares the full 1024-character password, including its last character', async () => {
  const password = 'a'.repeat(1024)
  const hash = await hashPassword(password)

  expect(await verifyPassword(password, hash)).toBe(true)
  expect(await verifyPassword('a'.repeat(1023) + 'b', hash)).toBe(false)
})
