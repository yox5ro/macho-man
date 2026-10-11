import { writeFileSync } from 'node:fs'
import { makeBackendConfig } from './terraform-backend.ts'

try {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY)
    throw new Error('R2 S3 credentials are required')
  const config = makeBackendConfig(
    process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    process.env.R2_STATE_BUCKET ?? '',
  )
  writeFileSync('infra/backend.tfbackend.json', JSON.stringify(config), {
    mode: 0o600,
  })
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Cannot prepare R2 backend',
  )
  process.exitCode = 1
}
