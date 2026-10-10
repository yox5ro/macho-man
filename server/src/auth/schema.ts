import { integer, text, sqliteTable, index } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  loginId: text('login_id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
})

export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    loginId: text('login_id')
      .notNull()
      .references(() => users.loginId, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('sessions_user_idx').on(t.loginId),
    index('sessions_expiry_idx').on(t.expiresAt),
  ],
)

export const loginAttempts = sqliteTable('login_attempts', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
})
