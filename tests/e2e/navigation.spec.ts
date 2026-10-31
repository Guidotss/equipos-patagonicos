import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { validarEntornoPruebas } from '../../scripts/pruebas-entorno.mjs'
import { E2E_PASSWORD } from './credenciales'
import { iniciarSesion } from './helpers'

test('el sidebar responde mientras espera una sección y conserva el historial', async ({ page }, testInfo) => {
  await iniciarSesion(page)
  let liberar!: () => void
  const espera = new Promise<void>((resolve) => { liberar = resolve })
  const destino = page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: 'Clientes', exact: true })
  await page.route('**/clientes?*', async (ruta) => {
    if (ruta.request().headers().rsc === '1') await espera
    await ruta.continue()
  })
  try {
    await destino.click()
    await expect(page.getByRole('status', { name: 'Abriendo Clientes', exact: true })).toBeVisible({ timeout: 1500 })
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('sidebar-pendiente.png') })
    liberar()
    await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()
    await expect(destino).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('status', { name: 'Abriendo Clientes', exact: true })).toBeHidden()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible()
  } finally {
    liberar()
  }
})

test('el menú móvil permite recorrer las secciones sin perder la navegación', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await iniciarSesion(page)
  for (const seccion of ['Clientes', 'Presupuestos', 'Cotizaciones', 'Configuración', 'Inicio']) {
    await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
    await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: seccion, exact: true }).click()
    await expect(page.getByRole('heading', { name: seccion, exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toBeHidden()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('navegacion-movil.png') })
})

test('una sesión válida de un usuario inactivo no puede abrir Inicio', async ({ page }) => {
  validarEntornoPruebas()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const email = `inactivo-navegacion-${crypto.randomUUID()}@equipos.test`
  const { data, error } = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true })
  if (error) throw error
  try {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Contraseña').fill(E2E_PASSWORD)
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click()
    await expect(page).toHaveURL(/\/sin-acceso$/)
    await expect(page.getByRole('heading', { name: 'Tu usuario todavía no está habilitado', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeHidden()
  } finally {
    const { error: borrarError } = await admin.auth.admin.deleteUser(data.user.id)
    if (borrarError) throw borrarError
  }
})
