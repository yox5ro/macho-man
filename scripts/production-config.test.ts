import { expect, it, vi } from 'vitest'
import { loadProductionConfig } from './production-config'

const account = 'a'.repeat(32)
const config = {
  name: 'macho-man',
  account_id: account,
  d1_databases: [
    { binding: 'DB', database_id: '12345678-1234-4234-8234-123456789abc' },
  ],
}

it('reads the applied configuration from state', async () => {
  const reader = vi.fn().mockReturnValue(JSON.stringify(config))
  expect(await loadProductionConfig(account, reader)).toEqual(config)
  expect(reader).toHaveBeenCalledOnce()
})

it('stops before reading state when the account is missing', async () => {
  const reader = vi.fn()
  await expect(loadProductionConfig('', reader)).rejects.toThrow('account')
  expect(reader).not.toHaveBeenCalled()
})

it('does not expose command errors containing credentials or state', async () => {
  const reader = vi.fn(() => {
    throw new Error('private-token')
  })
  await expect(loadProductionConfig(account, reader)).rejects.toThrow(
    'Cannot read applied Terraform configuration',
  )
})

it.each([
  undefined,
  { ...config, account_id: 'b'.repeat(32) },
  {
    ...config,
    d1_databases: [
      { binding: 'DB', database_id: '00000000-0000-0000-0000-000000000000' },
    ],
  },
])(
  'rejects missing, mismatched or placeholder configuration',
  async (value) => {
    await expect(
      loadProductionConfig(account, () => JSON.stringify(value)),
    ).rejects.toThrow()
  },
)
