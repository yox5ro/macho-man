import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './server/src/auth/schema.ts',
  out: './server/migrations',
  dialect: 'sqlite',
})
