import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { validateEnvTests } from './scripts/test-env.mjs'

const { baseURL } = validateEnvTests()
const appDir = process.env.EP_TESTS_APP_DIR
if (!appDir || !path.isAbsolute(appDir)) throw new Error('El runner debe preparar la copia temporal de Next')
const commandNext = [process.execPath, path.resolve('scripts/test-app.mjs')]

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  // Cada corrida compila una copia nueva de Next, sin la caché del servidor de desarrollo.
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `exec ${commandNext.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(' ')}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    timeout: 120_000,
  },
})
