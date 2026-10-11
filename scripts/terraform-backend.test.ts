import { expect, it } from 'vitest'
import { makeBackendConfig } from './terraform-backend'

it('keeps R2 state locking enabled and credentials out of backend configuration', () => {
  const config = makeBackendConfig('a'.repeat(32), 'private-state')
  expect(config).toMatchObject({
    bucket: 'private-state',
    key: 'production/terraform.tfstate',
    use_lockfile: true,
    endpoints: { s3: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com` },
    skip_credentials_validation: true,
    skip_requesting_account_id: true,
  })
  expect(config).not.toHaveProperty('access_key')
  expect(config).not.toHaveProperty('secret_key')
})

it.each([
  ['', 'state'],
  ['a'.repeat(32), ''],
  ['a'.repeat(32), '../state'],
])('rejects missing or invalid state storage settings', (account, bucket) => {
  expect(() => makeBackendConfig(account, bucket)).toThrow()
})
