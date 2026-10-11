import { execFileSync } from 'node:child_process'
import { z } from 'zod'

const productionConfig = z
  .object({
    name: z.literal('macho-man'),
    account_id: z.string().regex(/^[a-f0-9]{32}$/),
    d1_databases: z
      .array(
        z
          .object({
            binding: z.literal('DB'),
            database_id: z
              .uuid()
              .refine((id) => id !== '00000000-0000-0000-0000-000000000000'),
          })
          .passthrough(),
      )
      .length(1),
  })
  .passthrough()

const readAppliedOutput = () =>
  execFileSync(
    'terraform',
    ['-chdir=infra', 'output', '-json', 'wrangler_config'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    },
  )

export async function loadProductionConfig(
  account: string,
  readOutput: () => string = readAppliedOutput,
) {
  if (!/^[a-f0-9]{32}$/.test(account))
    throw new Error('A valid Cloudflare account is required')

  let output: unknown
  try {
    output = JSON.parse(readOutput())
  } catch {
    throw new Error('Cannot read applied Terraform configuration')
  }
  const parsed = productionConfig.safeParse(output)
  if (!parsed.success || parsed.data.account_id !== account)
    throw new Error(
      'Apply the Terraform configuration before deploying: invalid wrangler_config output',
    )
  return parsed.data
}
