// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { authApi, ApiError } from './auth-api'
vi.mock('./auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth-api')>()),
  authApi: { session: vi.fn(), login: vi.fn(), logout: vi.fn() },
}))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
it('keeps credentials on failure and clears the password after successful login', async () => {
  vi.mocked(authApi.session).mockRejectedValue(
    new ApiError('ログインしてください。', 401),
  )
  vi.mocked(authApi.login)
    .mockRejectedValueOnce(new Error('認証に失敗しました。'))
    .mockResolvedValueOnce({ user: { loginId: 'tester' } })
  const user = userEvent.setup()
  render(<App />)
  await user.type(await screen.findByLabelText('ログインID'), 'tester')
  await user.type(screen.getByLabelText('パスワード'), 'training-password')
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    '認証に失敗しました。',
  )
  expect(screen.getByLabelText('パスワード')).toHaveProperty(
    'value',
    'training-password',
  )
  await user.click(screen.getByRole('button', { name: 'ログイン' }))
  expect(
    await screen.findByText('tester さんとしてログインしています。'),
  ).toBeTruthy()
  vi.mocked(authApi.logout).mockResolvedValue({ user: { loginId: 'tester' } })
  await user.click(screen.getByRole('button', { name: 'ログアウト' }))
  expect(await screen.findByLabelText('パスワード')).toHaveProperty('value', '')
})
it('shows a connection error when session restoration fails', async () => {
  vi.mocked(authApi.session).mockRejectedValue(new TypeError('Failed to fetch'))
  render(<App />)
  expect((await screen.findByRole('alert')).textContent).toContain(
    'ログイン状態を確認できませんでした',
  )
})

it('accepts long passwords without truncating them', async () => {
  vi.mocked(authApi.session).mockRejectedValue(
    new ApiError('ログインしてください。', 401),
  )
  vi.mocked(authApi.login).mockResolvedValue({ user: { loginId: 'tester' } })
  const user = userEvent.setup()
  const password = 'a'.repeat(1024)
  render(<App />)

  await user.type(await screen.findByLabelText('ログインID'), 'tester')
  await user.click(screen.getByLabelText('パスワード'))
  await user.paste(password)
  await user.click(screen.getByRole('button', { name: 'ログイン' }))

  expect(authApi.login).toHaveBeenCalledWith('tester', password)
})

it('rejects passwords shorter than four characters before sending', async () => {
  vi.mocked(authApi.session).mockRejectedValue(
    new ApiError('ログインしてください。', 401),
  )
  const user = userEvent.setup()
  render(<App />)

  await user.type(await screen.findByLabelText('ログインID'), 'tester')
  await user.type(screen.getByLabelText('パスワード'), 'abc')
  await user.click(screen.getByRole('button', { name: 'ログイン' }))

  expect((await screen.findByRole('alert')).textContent).toContain(
    '4〜1024文字',
  )
  expect(authApi.login).not.toHaveBeenCalled()
})
