import type { AuthUser } from '../../shared/auth'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
async function request(
  path: string,
  body?: unknown,
): Promise<{ user: AuthUser }> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok)
    throw new ApiError(data.error ?? '通信に失敗しました。', response.status)
  return data
}

export const authApi = {
  session: () => request('session'),
  login: (loginId: string, password: string) =>
    request('login', { loginId, password }),
  logout: () => request('logout', {}),
}
