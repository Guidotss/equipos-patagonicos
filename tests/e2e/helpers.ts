import { expect, type Page } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD } from './credentials'

export async function iniciarSession(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
}

/** Sufijo único por corrida para no chocar con datos de corridas anteriores. */
export function sufijoUnico() {
  return Date.now().toString(36)
}
