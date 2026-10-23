// tests/integration/setup.ts
try {
  process.loadEnvFile('.env.local')
} catch {
  throw new Error('Falta .env.local: corré `npm run db:start` y `npm run env:local`')
}
