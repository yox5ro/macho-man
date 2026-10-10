import { z } from 'zod'

export const loginIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,24}$/)

export const loginSchema = z.object({
  loginId: loginIdSchema,
  password: z.string().min(1).max(128),
})

export const newPasswordSchema = z.string().min(12).max(128)

export type AuthUser = { loginId: string }
