import { expect, test } from '@playwright/test'
import { iniciarSesion, sufijoUnico } from './helpers'

test('alta de cliente: valida el CUIT sin perder lo escrito, agrega un contacto y se encuentra sin acentos', async ({ page }) => {
  const sufijo = sufijoUnico()
  const razonSocial = `Grúas Ñandú ${sufijo} S.A.`

  await iniciarSesion(page)
  await page.getByRole('link', { name: 'Clientes' }).click()
  await page.getByRole('link', { name: 'Nuevo cliente' }).click()

  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByLabel('CUIT').fill('30-71952967-1')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText('El CUIT no es válido')).toBeVisible()
  await expect(page.getByLabel('Razón social')).toHaveValue(razonSocial)

  await page.getByLabel('CUIT').fill('')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()

  await page.getByRole('button', { name: 'Agregar contacto' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill('Yanina Colman')
  await dialogo.getByLabel('Email').fill('yanina@ejemplo.com')
  await dialogo.getByRole('button', { name: 'Guardar contacto' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText('Yanina Colman')).toBeVisible()

  await page.goto(`/clientes?q=${encodeURIComponent(`gruas nandu ${sufijo}`)}`)
  await expect(page.getByRole('link', { name: razonSocial })).toBeVisible()
})

test('el CUIT de un cliente existente no se puede repetir', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/clientes/nuevo')
  await page.getByLabel('Razón social').fill(`Duplicado ${sufijoUnico()}`)
  await page.getByLabel('CUIT').fill('30-71952967-0')
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByText('Ya existe un cliente con ese CUIT').first()).toBeVisible()
})

test('un cliente se puede desactivar y volver a activar', async ({ page }) => {
  const razonSocial = `Para desactivar ${sufijoUnico()}`
  await iniciarSesion(page)
  await page.goto('/clientes/nuevo')
  await page.getByLabel('Razón social').fill(razonSocial)
  await page.getByRole('button', { name: 'Crear cliente' }).click()
  await expect(page.getByRole('heading', { name: razonSocial })).toBeVisible()

  await page.getByRole('button', { name: `Desactivar ${razonSocial}` }).click()
  await expect(page.getByText('Inactivo')).toBeVisible()
  await page.getByRole('button', { name: `Activar ${razonSocial}` }).click()
  await expect(page.getByText('Inactivo')).toBeHidden()
})
