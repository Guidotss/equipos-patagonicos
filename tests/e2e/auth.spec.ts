import { expect, test } from '@playwright/test'
import { E2E_EMAIL, E2E_NOMBRE, E2E_PASSWORD } from './credenciales'

test('sin sesión redirige al login y vuelve a la página pedida después de ingresar', async ({ page }) => {
  await page.goto('/clientes')
  await expect(page).toHaveURL(/\/login\?next=%2Fclientes$/)

  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
})

test('muestra un error con contraseña incorrecta', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill('incorrecta')
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('navega por las secciones y cierra sesión', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Ingresar' }).click()

  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible()
  await expect(page.getByText(`Hola, ${E2E_NOMBRE}`)).toBeVisible()

  await page.getByRole('link', { name: 'Cotizaciones' }).click()
  await expect(page.getByRole('heading', { name: 'Cotizaciones' })).toBeVisible()

  await page.getByRole('button', { name: 'Menú de usuario' }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})
