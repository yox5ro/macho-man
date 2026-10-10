import { expect, it, vi } from 'vitest'
import { loadProductionConfig } from './production-config'

const config = {
  name: 'macho-man',
  account_id: 'a'.repeat(32),
  d1_databases: [
    { binding: 'DB', database_id: '12345678-1234-4234-8234-123456789abc' },
  ],
}

const outputs = (value: unknown) => ({
  data: [{ attributes: { name: 'wrangler_config', sensitive: false, value } }],
})

it('reads the applied configuration without requesting a plan or apply', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(outputs(config)))
  expect(
    await loadProductionConfig('ws-example', 'private-token', fetcher),
  ).toEqual(config)
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://app.terraform.io/api/v2/workspaces/ws-example/current-state-version-outputs',
  )
})

it('stops before contacting HCP when credentials are missing', async () => {
  const fetcher = vi.fn()
  await expect(loadProductionConfig('', '', fetcher)).rejects.toThrow('HCP')
  expect(fetcher).not.toHaveBeenCalled()
})

it('does not expose API error bodies containing credentials', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response('private-token', { status: 403 }))
  await expect(
    loadProductionConfig('ws-example', 'private-token', fetcher),
  ).rejects.toThrow('HTTP 403')
})

it.each([
  undefined,
  { ...config, account_id: '' },
  {
    ...config,
    d1_databases: [
      { binding: 'DB', database_id: '00000000-0000-0000-0000-000000000000' },
    ],
  },
])('rejects missing or placeholder deployment configuration', async (value) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(outputs(value)))
  await expect(
    loadProductionConfig('ws-example', 'private-token', fetcher),
  ).rejects.toThrow()
})
