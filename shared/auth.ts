import { z } from 'zod'

export const loginIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/)

export const PASSWORD_MIN_LENGTH = 4
export const PASSWORD_MAX_LENGTH = 1024

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)

export const loginSchema = z.object({
  loginId: loginIdSchema,
  password: newPasswordSchema,
})

export type AuthUser = { loginId: string }
