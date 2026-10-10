import { describe, expect, it } from 'vitest'
import { loginSchema, newPasswordSchema } from './auth'

describe('password length policy', () => {
  it.each([
    [3, false],
    [4, true],
    [1024, true],
    [1025, false],
  ])('accepts length %i: %s', (length, accepted) => {
    const password = 'a'.repeat(length)

    expect(newPasswordSchema.safeParse(password).success).toBe(accepted)
    expect(loginSchema.safeParse({ loginId: 'tester', password }).success).toBe(
      accepted,
    )
  })
})

it('counts Unicode characters and preserves the exact password', () => {
  const password = '😀'.repeat(1024)

  expect(newPasswordSchema.parse(password)).toBe(password)
  expect(newPasswordSchema.safeParse('😀'.repeat(3)).success).toBe(false)
  expect(newPasswordSchema.safeParse('😀'.repeat(1025)).success).toBe(false)
})
