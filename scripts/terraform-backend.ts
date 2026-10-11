export function makeBackendConfig(account: string, bucket: string) {
  if (!/^[a-f0-9]{32}$/.test(account))
    throw new Error('Set the real CLOUDFLARE_ACCOUNT_ID')
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error('Set a valid R2_STATE_BUCKET')

  return {
    bucket,
    key: 'production/terraform.tfstate',
    region: 'auto',
    endpoints: { s3: `https://${account}.r2.cloudflarestorage.com` },
    use_lockfile: true,
    use_path_style: true,
    skip_credentials_validation: true,
    skip_region_validation: true,
    skip_requesting_account_id: true,
    skip_metadata_api_check: true,
    skip_s3_checksum: true,
  }
}
