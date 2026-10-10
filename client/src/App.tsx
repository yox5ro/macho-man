import { useEffect, useState } from 'react'
import type { AuthUser } from '../../shared/auth'
import { authApi, ApiError } from './auth-api'
import './App.css'

function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    authApi
      .session()
      .then((result) => {
        if (active) setUser(result.user)
      })
      .catch((cause) => {
        if (active && !(cause instanceof ApiError && cause.status === 401))
          setError(
            'ログイン状態を確認できませんでした。通信を確認して再読み込みしてください。',
          )
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function login(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setUser((await authApi.login(loginId, password)).user)
      setPassword('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : '通信に失敗しました。入力を保持したまま再試行できます。',
      )
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    setError('')
    try {
      await authApi.logout()
      setUser(null)
    } catch {
      setError('ログアウトに失敗しました。再試行してください。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="auth-card">
      <p className="brand">MACHO MAN</p>
      <h1>{user ? 'トレーニング記録' : 'ログイン'}</h1>
      {checking ? (
        <p role="status">ログイン状態を確認中…</p>
      ) : user ? (
        <>
          <p>{user.loginId} さんとしてログインしています。</p>
          <p>トレーニング記録の機能は準備中です。</p>
          <button disabled={busy} onClick={logout}>
            {busy ? 'ログアウト中…' : 'ログアウト'}
          </button>
        </>
      ) : (
        <form onSubmit={login}>
          <p>今日のトレーニングを積み重ねよう。</p>
          <label htmlFor="login-id">ログインID</label>
          <input
            id="login-id"
            name="username"
            autoComplete="username"
            required
            maxLength={24}
            pattern="[A-Za-z0-9_-]+"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            disabled={busy}
            autoCapitalize="none"
            spellCheck={false}
          />
          <label htmlFor="password">パスワード</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <button disabled={busy}>{busy ? 'ログイン中…' : 'ログイン'}</button>
          <p className="hint">
            アカウントの作成・パスワードの再設定は運営者にご連絡ください。
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  )
}
export default App
