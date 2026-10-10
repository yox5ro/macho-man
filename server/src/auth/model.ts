import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto'

const params = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 }

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, params, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt-v1$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, salt, hash] = stored.split('$')
  if (
    algorithm !== 'scrypt-v1' ||
    !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{64}$/.test(hash ?? '')
  )
    return false
  return timingSafeEqual(
    await derive(password, Buffer.from(salt, 'hex')),
    Buffer.from(hash, 'hex'),
  )
}

export async function hashToken(token: string): Promise<string> {
  return createHash('sha256').update(token).digest('hex')
}

export const createToken = () => randomBytes(32).toString('hex')

export const SESSION_SECONDS = 60 * 60 * 24 * 7
// Unknown accounts incur the same password derivation cost without storing a real credential.
export const DUMMY_PASSWORD = `scrypt-v1$${'00'.repeat(16)}$${'00'.repeat(32)}`
