import { and, eq, gt, lte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import { users, sessions, loginAttempts } from './schema'

export interface AuthRepository {
  findUser(
    id: string,
  ): Promise<{ loginId: string; passwordHash: string } | undefined>
  consumeAttempt(key: string, now: number): Promise<boolean>
  createSession(hash: string, id: string, expires: number): Promise<void>
  findSession(
    hash: string,
  ): Promise<{ loginId: string; expiresAt: number } | undefined>
  deleteSession(hash: string): Promise<void>
}

export function authRepository(binding: D1Database): AuthRepository {
  const db = drizzle(binding)
  return {
    findUser: (id) =>
      db.select().from(users).where(eq(users.loginId, id)).get(),
    async consumeAttempt(key, now) {
      await db.delete(loginAttempts).where(lte(loginAttempts.expiresAt, now))
      const rows = await db
        .insert(loginAttempts)
        .values({ key, count: 1, expiresAt: now + 900 })
        .onConflictDoUpdate({
          target: loginAttempts.key,
          set: { count: sql`${loginAttempts.count} + 1` },
        })
        .returning()
      return rows[0].count <= 10
    },
    async createSession(hash, id, expires) {
      await db.batch([
        db
          .delete(sessions)
          .where(lte(sessions.expiresAt, Math.floor(Date.now() / 1000))),
        db
          .insert(sessions)
          .values({ tokenHash: hash, loginId: id, expiresAt: expires }),
      ])
    },
    findSession: (hash) =>
      db
        .select({ loginId: sessions.loginId, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(
          and(
            eq(sessions.tokenHash, hash),
            gt(sessions.expiresAt, Math.floor(Date.now() / 1000)),
          ),
        )
        .get(),
    async deleteSession(hash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hash))
    },
  }
}
