import { expect, test } from '@playwright/test'
import { iniciarSession, sufijoUnico } from './helpers'
import { withBase } from './database'

const signersCreados: string[] = []
const equipmentCreados: string[] = []

test.afterEach(async () => {
  await withBase(async (db) => {
    await db.query('delete from public.firmantes where nombre = any($1::text[])', [signersCreados])
    await db.query('delete from public.equipos where nombre = any($1::text[])', [equipmentCreados])
  })
  signersCreados.length = 0
  equipmentCreados.length = 0
})

test('firmantes: alta y edición', async ({ page }) => {
  const nombre = `Firmante ${sufijoUnico()}`
  signersCreados.push(nombre)
  await iniciarSession(page)
  await page.goto('/configuracion/firmantes')

  await page.getByRole('link', { name: 'Nuevo firmante' }).click()
  await expect(page).toHaveURL(/\/configuracion\/firmantes\/nuevo$/)
  await page.getByLabel('Nombre').fill(nombre)
  await page.getByLabel('Cargo').fill('Contrataciones / Logística')
  await page.getByRole('button', { name: 'Guardar firmante' }).click()
  // Esperar la lista: en el alta la vista previa de la firma también muestra el nombre.
  await expect(page).toHaveURL(/\/configuracion\/firmantes$/)
  await expect(page.getByText(nombre)).toBeVisible()

  await page.getByRole('link', { name: `Editar a ${nombre}` }).click()
  await expect(page.getByRole('heading', { name: nombre })).toBeVisible()
  await page.getByLabel('Teléfono').fill('299 000 0000')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).toHaveURL(/\/configuracion\/firmantes$/)
  // Acotado al firmante creado por esta prueba.
  await expect(page.getByRole('listitem').filter({ hasText: nombre }).getByText('299 000 0000')).toBeVisible()
})

test('equipos: valida la capacidad y acepta decimales con coma', async ({ page }) => {
  const nombre = `Grúa prueba ${sufijoUnico()}`
  equipmentCreados.push(nombre)
  await iniciarSession(page)
  await page.goto('/configuracion/equipos')

  await page.getByRole('link', { name: 'Nuevo equipo' }).click()
  await expect(page).toHaveURL(/\/configuracion\/equipos\/nuevo$/)
  await page.getByLabel('Nombre').fill(nombre)
  await page.getByLabel('Capacidad (TN)').fill('0')
  await page.getByRole('button', { name: 'Guardar equipo' }).click()
  await expect(page.getByText('Ingresá una capacidad en toneladas mayor a 0')).toBeVisible()
  await expect(page).toHaveURL(/\/configuracion\/equipos\/nuevo$/)
  await expect(page.getByLabel('Nombre')).toHaveValue(nombre)

  await page.getByLabel('Capacidad (TN)').fill('60,5')
  await page.getByRole('button', { name: 'Guardar equipo' }).click()
  await expect(page).toHaveURL(/\/configuracion\/equipos$/)
  await expect(page.getByText(nombre)).toBeVisible()
  // Acotado al equipo creado por esta prueba.
  await expect(page.getByRole('listitem').filter({ hasText: nombre }).getByText('60,5 TN')).toBeVisible()
})

test('plantillas iniciales: mensual y por jornada con sus textos', async ({ page }) => {
  await iniciarSession(page)
  await page.goto('/configuracion/plantillas')
  await expect(page.getByRole('link', { name: 'Por jornada - Grúa con operador' })).toBeVisible()

  await page.getByRole('link', { name: 'Mensual - Grúa con operador' }).click()
  await expect(page.getByText('CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR')).toBeVisible()
  await expect(page.getByText('Alquiler mensual Grúa {{capacidad}} TN')).toBeVisible()
})

test('empresa: muestra los datos reales', async ({ page }) => {
  await iniciarSession(page)
  await page.goto('/configuracion/empresa')
  await expect(page.getByLabel('Razón social')).toHaveValue('Equipos Patagónicos')
  await expect(page.getByLabel('Ciudad')).toHaveValue('Neuquén')
})
