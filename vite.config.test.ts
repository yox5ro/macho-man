import { createServer as createHttpServer } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import config from './vite.config'
import { createApp } from './server/src/auth/router'

const app = createApp()
const backend = createHttpServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(key, value)
  }
  const result = await app.fetch(
    new Request(`http://${request.headers.host}${request.url}`, {
      method: request.method,
      headers,
      body: Buffer.concat(chunks).toString(),
    }),
  )
  response.writeHead(result.status, Object.fromEntries(result.headers))
  response.end(await result.text())
})
let vite: ViteDevServer
let origin: string

beforeAll(async () => {
  await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve))
  const address = backend.address()
  if (!address || typeof address === 'string')
    throw new Error('Backend did not start')
  const proxy = config.server?.proxy?.['/api']
  vite = await createServer({
    ...config,
    configFile: false,
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api': {
          ...(typeof proxy === 'string' ? { changeOrigin: true } : proxy),
          target: `http://127.0.0.1:${address.port}`,
        },
      },
    },
  })
  await vite.listen()
  const clientAddress = vite.httpServer!.address()
  if (!clientAddress || typeof clientAddress === 'string')
    throw new Error('Vite did not start')
  origin = `http://127.0.0.1:${clientAddress.port}`
})

afterAll(async () => {
  await vite?.close()
  await new Promise<void>((resolve, reject) =>
    backend.close((error) => (error ? reject(error) : resolve())),
  )
})

it('allows a same-origin login through the development proxy', async () => {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({
    error: 'ログインIDとパスワードを確認してください。',
  })
})

it.each(['https://evil.test', 'null', ''])(
  'rejects an untrusted origin %s through the development proxy',
  async (source) => {
    const response = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: source ? { Origin: source } : {},
      body: '{}',
    })

    expect(response.status).toBe(403)
  },
)
