// tests/e2e/cotizacion-vista-previa.spec.ts
// Las rutas de PDF del editor: POST /cotizaciones/vista-previa (estado sin guardar) y GET …/pdf?actual=1.
// Las Server Actions se prueban desde la pantalla (tests/e2e/cotizaciones.spec.ts).
import { expect, test } from '@playwright/test'
import { withBase } from './database'
import { extractText, getDocumentProxy } from 'unpdf'
import type { StatusEditor } from '@/lib/quotes/editor'
import { iniciarSession } from './helpers'

const MARCA = 'e2e-vista-previa'
let base: { cliente: string; equipo: string; firmante: string; enviada: string }

test.beforeAll(async () => {
  base = await withBase(async (db) => {
    const { rows: [ids] } = await db.query<{ cliente: string; equipo: string; firmante: string }>(
      `select
         (select id from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.') as cliente,
         (select id from public.equipos where nombre = 'Grúa telescópica XCMG QY70K-1 40 TN') as equipo,
         (select id from public.firmantes where nombre = 'Thomas Cravero') as firmante`,
    )
    // Una enviada que se corrigió después del envío. El envío apunta a un PDF que no está en Storage: sin ?actual=1
    // la ruta lo intentaría bajar; con ?actual=1 tiene que generar lo guardado ahora.
    const { rows: [sent] } = await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, equipo_id, estado, asunto, datos, notas)
       values ($1, 'jornada', $2, 'enviada', 'Asunto corregido después del envío', '{"ubicacion": "Neuquén"}', $3)
       returning id`,
      [ids.cliente, ids.equipo, MARCA],
    )
    await db.query(
      `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, precio_unitario, unidad)
       values ($1, 1, 'Jornada', 1950000, 'JORNADA')`,
      [sent.id],
    )
    await db.query('insert into public.cotizacion_envios (cotizacion_id, pdf_path) values ($1, $2)', [
      sent.id,
      `cotizaciones/${sent.id}/enviada-que-no-esta.pdf`,
    ])
    return { ...ids, enviada: sent.id }
  })
})

test.afterAll(async () => {
  await withBase((db) => db.query('delete from public.cotizaciones where notas = $1', [MARCA]))
})

async function textOfPdf(pdf: Buffer): Promise<string> {
  const document = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(document, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** El estado de una cotización nueva por jornada en el editor, sin guardar. */
function estado(changes: Partial<StatusEditor> = {}): StatusEditor {
  return {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: { id: base.cliente, razon_social: 'Lo que diga el navegador', cuit: null },
    contactoId: '',
    templateId: '',
    formato: 'jornada',
    equipoId: base.equipo,
    firmanteId: base.firmante,
    fecha: '2026-10-22',
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: 'Alquiler de Grúa de {{capacidad}} TN',
    intro: 'Servicios de izaje en {{ubicacion}}.',
    datos: {
      ubicacion: '',
      horario: '',
      plazo_entrega: '',
      duracion_estimada: '',
      forma_pago: '',
      disponibilidad: '',
      indice_base: '',
      proxima_actualizacion: '',
    },
    items: [
      {
        clave: 'a',
        seccion: 'Precios Jornada',
        descripcion: 'Jornada de Grúa',
        cantidad: '1',
        precio: '1.950.000',
        unidad: 'JORNADA',
      },
    ],
    bloques: [{ clave: 'b', titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.', hidden: false }],
    replacesA: null,
    ...changes,
  }
}

test('la vista previa dibuja el estado sin guardar y exige sesión y un cuerpo válido', async ({ page, playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL })
  const withoutSession = await anonymous.post('/cotizaciones/vista-previa', { data: { estado: estado() }, maxRedirects: 0 })
  expect(withoutSession.status()).toBe(307)
  await anonymous.dispose()

  await iniciarSession(page)
  const broken = await page.request.post('/cotizaciones/vista-previa', { data: { estado: { ...estado(), items: 'nada' } } })
  expect(broken.status()).toBe(400)
  const withoutWrapper = await page.request.post('/cotizaciones/vista-previa', { data: estado() })
  expect(withoutWrapper.status()).toBe(400)
  const noJson = await page.request.post('/cotizaciones/vista-previa', {
    headers: { 'Content-Type': 'text/plain' },
    data: 'hola',
  })
  expect(noJson.status()).toBe(400)

  const response = await page.request.post('/cotizaciones/vista-previa', { data: { estado: estado() } })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  const texto = await textOfPdf(await response.body())
  // El cliente y el equipo se releen de la base; las variables sin completar quedan a la vista.
  expect(texto).toContain('VERTICE SERVICIOS INTEGRALES S.R.L.')
  expect(texto).not.toContain('Lo que diga el navegador')
  expect(texto).toContain('Alquiler de Grúa de 40 TN')
  expect(texto).toContain('Servicios de izaje en {{ubicacion}}.')

  // No guardó nada.
  const guardadas = await withBase((db) =>
    db.query(`select 1 from public.cotizaciones where asunto = 'Alquiler de Grúa de {{capacidad}} TN'`),
  )
  expect(guardadas.rowCount).toBe(0)
})

test('?actual=1 muestra lo guardado ahora en una enviada, no su último envío', async ({ page }) => {
  await iniciarSession(page)
  const response = await page.request.get(`/cotizaciones/${base.enviada}/pdf?actual=1`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('application/pdf')
  expect(await textOfPdf(await response.body())).toContain('Asunto corregido después del envío')
})
