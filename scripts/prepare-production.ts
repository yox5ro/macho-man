import { writeFile } from 'node:fs/promises'
import { loadProductionConfig } from './production-config.ts'

try {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
    throw new Error(
      'CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required',
    )
  const config = await loadProductionConfig(
    process.env.HCP_WORKSPACE_ID ?? '',
    process.env.HCP_TERRAFORM_TOKEN ?? '',
  )
  if (config.account_id !== process.env.CLOUDFLARE_ACCOUNT_ID)
    throw new Error(
      'Cloudflare account does not match the applied Terraform configuration',
    )
  await writeFile(
    '.wrangler.production.json',
    `${JSON.stringify(config, null, 2)}\n`,
  )
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Cannot prepare production configuration',
  )
  process.exitCode = 1
}
