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

export async function loadProductionConfig(
  workspace: string,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^ws-[a-zA-Z0-9]+$/.test(workspace) || !token)
    throw new Error('HCP_WORKSPACE_ID and HCP_TERRAFORM_TOKEN are required')

  const response = await fetcher(
    `https://app.terraform.io/api/v2/workspaces/${workspace}/current-state-version-outputs`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json',
      },
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (!response.ok)
    throw new Error(
      `HCP Terraform outputs request failed: HTTP ${response.status}`,
    )
  const payload = (await response.json()) as {
    data: { attributes: { name: string; sensitive: boolean; value: unknown } }[]
  }
  const output = payload.data.find(
    ({ attributes }) => attributes.name === 'wrangler_config',
  )
  const parsed = productionConfig.safeParse(output?.attributes.value)
  if (output?.attributes.sensitive || !parsed.success)
    throw new Error(
      'Apply the Terraform configuration before deploying: invalid wrangler_config output',
    )
  return parsed.data
}
