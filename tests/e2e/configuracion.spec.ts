import { expect, test } from '@playwright/test'
import { iniciarSesion, sufijoUnico } from './helpers'

test('firmantes: alta y edición', async ({ page }) => {
  const nombre = `Firmante ${sufijoUnico()}`
  await iniciarSesion(page)
  await page.goto('/configuracion/firmantes')

  await page.getByRole('button', { name: 'Nuevo firmante' }).click()
  const alta = page.getByRole('dialog')
  await alta.getByLabel('Nombre').fill(nombre)
  await alta.getByLabel('Cargo').fill('Contrataciones / Logística')
  await alta.getByRole('button', { name: 'Guardar firmante' }).click()
  await expect(alta).toBeHidden()
  await expect(page.getByText(nombre)).toBeVisible()

  await page.getByRole('button', { name: `Editar a ${nombre}` }).click()
  const edicion = page.getByRole('dialog')
  await edicion.getByLabel('Teléfono').fill('299 000 0000')
  await edicion.getByRole('button', { name: 'Guardar firmante' }).click()
  await expect(edicion).toBeHidden()
  await expect(page.getByText('299 000 0000')).toBeVisible()
})

test('equipos: valida la capacidad y acepta decimales con coma', async ({ page }) => {
  const nombre = `Grúa prueba ${sufijoUnico()}`
  await iniciarSesion(page)
  await page.goto('/configuracion/equipos')

  await page.getByRole('button', { name: 'Nuevo equipo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill(nombre)
  await dialogo.getByLabel('Capacidad (TN)').fill('0')
  await dialogo.getByRole('button', { name: 'Guardar equipo' }).click()
  await expect(dialogo.getByText('Ingresá una capacidad en toneladas mayor a 0')).toBeVisible()

  await dialogo.getByLabel('Capacidad (TN)').fill('60,5')
  await dialogo.getByRole('button', { name: 'Guardar equipo' }).click()
  await expect(dialogo).toBeHidden()
  await expect(page.getByText(nombre)).toBeVisible()
  await expect(page.getByText('60,5 TN')).toBeVisible()
})

test('plantillas iniciales: mensual y por jornada con sus textos', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/configuracion/plantillas')
  await expect(page.getByRole('link', { name: 'Por jornada - Grúa con operador' })).toBeVisible()

  await page.getByRole('link', { name: 'Mensual - Grúa con operador' }).click()
  await expect(page.getByText('CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR')).toBeVisible()
  await expect(page.getByText('Alquiler mensual Grúa {{capacidad}} TN')).toBeVisible()
})

test('empresa: muestra los datos reales', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/configuracion/empresa')
  await expect(page.getByLabel('Razón social')).toHaveValue('Equipos Patagónicos')
  await expect(page.getByLabel('Ciudad')).toHaveValue('Neuquén')
})
