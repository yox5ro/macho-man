import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it('requires prepared Terraform configuration before remote user operations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'macho-cli-test-'))
  try {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/user.ts'), 'list', '--remote'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('npm run deploy:prepare')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
