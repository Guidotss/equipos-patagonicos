// tests/e2e/cotizaciones.spec.ts
import { expect, test, type Page } from '@playwright/test'
import pg from 'pg'
import { iniciarSesion, sufijoUnico } from './helpers'

async function conBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** Hoy en Argentina, como lo calcula v_cotizaciones para "vencida". */
const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date"

test.describe('lista de cotizaciones', () => {
  // Marca de los datos de esta prueba (notas del cliente y de las cotizaciones): se borran al empezar y al terminar.
  const MARCA = 'e2e-lista'
  // Solo letras: con dígitos (sufijoUnico es base 36), buscar_cotizaciones también compararía el comienzo del número
  // y "…1…" traería todas las cotizaciones.
  const clave = sufijoUnico().replace(/\d/g, (digito) => 'abcdefghij'[Number(digito)])
  const razonSocial = `Montajes Ñandú ${clave}`
  // Sin tildes: la búsqueda tiene que encontrar "Ñandú". La clave deja afuera los datos de otras pruebas.
  const busqueda = `nandu ${clave}`
  const LISTA = `/cotizaciones?q=${encodeURIComponent(busqueda)}`

  type Cotizacion = { id: string; numero: number }
  let vencida: Cotizacion & { fecha: string; fecha_corta: string; vence_el: string }
  let aprobada: Cotizacion

  async function limpiar(db: pg.Client) {
    // Por cliente: también se lleva las copias de "Duplicar", que no copian las notas.
    await db.query(
      `delete from public.cotizaciones where cliente_id in (select id from public.clientes where notas = $1)`,
      [MARCA],
    )
    await db.query(`delete from public.clientes where notas = $1`, [MARCA])
  }

  test.beforeAll(async () => {
    await conBase(async (db) => {
      await limpiar(db)
      const {
        rows: [cliente],
      } = await db.query<{ id: string }>(
        `insert into public.clientes (razon_social, notas) values ($1, $2) returning id`,
        [razonSocial, MARCA],
      )
      // 25 borradores con variables en el asunto: la lista los muestra resueltos con el equipo y los datos.
      await db.query(
        `insert into public.cotizaciones (cliente_id, formato, equipo_id, asunto, datos, notas, fecha)
         select $1, 'jornada', e.id, 'Cotización N° {{numero}} - Grúa de {{capacidad}} TN en {{ubicacion}}',
                '{"ubicacion": "Añelo"}', $2, ${HOY} - g
         from public.equipos e, generate_series(1, 25) g
         where e.nombre = 'Grúa telescópica XCMG QY70K-1 40 TN'`,
        [cliente.id, MARCA],
      )
      // Enviada hace 60 días con 30 de validez: vencida.
      const resultadoVencida = await db.query<Cotizacion & { fecha: string; fecha_corta: string; vence_el: string }>(
        `insert into public.cotizaciones
           (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, mostrar_total)
         values ($1, 'mensual', 'Izaje de tanques en Neuquén', $2, ${HOY} - 60, 30, 'enviada', true)
         returning id, numero::int as numero, to_char(fecha, 'YYYY-MM-DD') as fecha,
                   to_char(fecha, 'DD/MM/YYYY') as fecha_corta,
                   to_char(fecha + validez_dias, 'DD/MM/YYYY') as vence_el`,
        [cliente.id, MARCA],
      )
      vencida = resultadoVencida.rows[0]
      const {
        rows: [enviada],
      } = await db.query<Cotizacion>(
        `insert into public.cotizaciones
           (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, mostrar_total)
         values ($1, 'jornada', 'Traslado de equipo a Plottier', $2, ${HOY} - 2, 30, 'enviada', true)
         returning id, numero::int as numero`,
        [cliente.id, MARCA],
      )
      // Precios cotizados que la lista nunca tiene que mostrar.
      await db.query(
        `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, precio_unitario, unidad)
         values ($1, 1, 'Jornada de grúa', 1950000, 'JORNADA'), ($2, 1, 'Jornada de grúa', 1950000, 'JORNADA')`,
        [vencida.id, enviada.id],
      )
      const resultadoAprobada = await db.query<Cotizacion>(
        `insert into public.cotizaciones
           (cliente_id, formato, asunto, notas, fecha, estado, fecha_aprobacion, presupuesto_estado)
         values ($1, 'jornada', 'Montaje de estructura en Centenario', $2, ${HOY} - 10, 'aprobada', ${HOY} - 5,
                 'en_curso')
         returning id, numero::int as numero`,
        [cliente.id, MARCA],
      )
      aprobada = resultadoAprobada.rows[0]
      await db.query(
        `insert into public.cotizaciones
           (cliente_id, origen, formato, asunto, notas, fecha, estado, fecha_aprobacion, presupuesto_estado)
         values ($1, 'directa', 'jornada', 'Movimiento de contenedores en Plaza Huincul', $2, ${HOY}, 'aprobada',
                 ${HOY}, 'en_curso')`,
        [cliente.id, MARCA],
      )
    })
  })

  test.afterAll(async () => {
    await conBase(limpiar)
  })

  async function abrirLista(page: Page) {
    await iniciarSesion(page)
    await page.goto(LISTA)
    await expect(page.getByRole('heading', { name: 'Cotizaciones', level: 1 })).toBeVisible()
  }

  test('busca sin acentos, resume el trabajo y pagina de a 25', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones')
    // Un solo heading con "cotizaciones": auth.spec.ts lo busca por substring.
    await expect(page.getByRole('heading', { name: /cotizaciones/i })).toHaveCount(1)

    const buscador = page.getByRole('searchbox', { name: 'Buscar cotizaciones' })
    await buscador.fill(busqueda)
    await buscador.press('Enter')
    await expect(page).toHaveURL(/q=nandu/)

    const tabla = page.getByRole('table')
    const filas = tabla.getByRole('row')
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()
    await expect(filas).toHaveCount(26) // encabezado + 25
    // El asunto con variables sale resuelto con el equipo (capacidad) y los datos (ubicación).
    await expect(filas.filter({ hasText: 'Grúa de 40 TN en Añelo' }).first()).toBeVisible()
    await expect(tabla).not.toContainText('{{')

    await page.getByRole('link', { name: 'Siguiente' }).click()
    await expect(page).toHaveURL(/pagina=2/)
    await expect(page.getByText('Mostrando 26–29 de 29')).toBeVisible()
    await expect(filas).toHaveCount(5)
    await expect(page.getByRole('link', { name: 'Siguiente' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Anterior' }).click()
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()

    // Por número (buscar_cotizaciones compara el comienzo del número).
    await page.goto(`/cotizaciones?q=${vencida.numero}`)
    await expect(page.getByRole('link', { name: String(vencida.numero), exact: true })).toBeVisible()
  })

  test('filtra por estado: "Vencida" y "Enviada" coinciden con la pastilla', async ({ page }) => {
    await abrirLista(page)
    const filas = page.getByRole('table').getByRole('row')

    await page.getByRole('combobox', { name: 'Estado' }).selectOption('vencida')
    await expect(page).toHaveURL(/estado=vencida/)
    await expect(filas).toHaveCount(2)
    const filaVencida = filas.filter({ hasText: 'Izaje de tanques en Neuquén' })
    await expect(filaVencida.getByText('Vencida')).toBeVisible()
    // "Vence el" en ámbar cuando ya venció.
    await expect(filaVencida.getByText(vencida.vence_el)).toHaveClass(/text-amber-700/)

    await page.getByRole('combobox', { name: 'Estado' }).selectOption('enviada')
    await expect(page).toHaveURL(/estado=enviada/)
    await expect(filas).toHaveCount(2)
    await expect(filas.filter({ hasText: 'Traslado de equipo a Plottier' }).getByText('Enviada')).toBeVisible()
    await expect(page.getByRole('table')).not.toContainText('Izaje de tanques')
  })

  test('no muestra ningún monto', async ({ page }) => {
    await abrirLista(page)
    await expect(page.getByRole('table')).toBeVisible()
    const principal = page.getByRole('main')
    await expect(principal).not.toContainText('$')
    await expect(principal).not.toContainText('1.950.000')
    await expect(page.getByRole('columnheader', { name: /importe|monto|total/i })).toHaveCount(0)
  })

  test('filtra por cliente y por fechas, y sin resultados ofrece limpiar', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones')
    await page.getByRole('combobox', { name: 'Cliente' }).selectOption({ label: razonSocial })
    await expect(page).toHaveURL(/cliente=[0-9a-f-]{36}/)
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()

    // Un solo día: el de la vencida (los borradores son de los últimos 25 días).
    await page.getByRole('button', { name: 'Fechas: Cualquier fecha' }).click()
    const rango = page.getByRole('dialog', { name: 'Rango de fechas' })
    await rango.getByLabel('Desde').fill(vencida.fecha)
    await rango.getByLabel('Hasta').fill(vencida.fecha)
    await rango.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page).toHaveURL(new RegExp(`desde=${vencida.fecha}`))
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2)
    await expect(
      page.getByRole('button', { name: `Fechas: ${vencida.fecha_corta} – ${vencida.fecha_corta}` }),
    ).toBeVisible()

    const buscador = page.getByRole('searchbox', { name: 'Buscar cotizaciones' })
    await buscador.fill(`sin resultados ${clave}`)
    await buscador.press('Enter')
    await expect(page.getByText(`No hay cotizaciones que coincidan con "sin resultados ${clave}".`)).toBeVisible()
    await page.getByRole('link', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL(/\/cotizaciones$/)
  })

  test('acciones de fila: PDF salvo en una directa, menú y duplicar', async ({ page }) => {
    await abrirLista(page)
    const tabla = page.getByRole('table')

    await expect(tabla.getByRole('link', { name: `Ver PDF de la ${vencida.numero}` })).toHaveAttribute(
      'href',
      `/cotizaciones/${vencida.id}/pdf`,
    )
    const filaDirecta = tabla.getByRole('row').filter({ hasText: 'Movimiento de contenedores en Plaza Huincul' })
    await expect(filaDirecta.getByText('Directa')).toBeVisible()
    await expect(filaDirecta.getByRole('link', { name: /Ver PDF/ })).toHaveCount(0)

    await tabla.getByRole('button', { name: `Más acciones de la ${vencida.numero}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Abrir' })).toHaveAttribute('href', `/cotizaciones/${vencida.id}`)
    await expect(page.getByRole('menuitem', { name: 'Descargar PDF' })).toHaveAttribute(
      'href',
      `/cotizaciones/${vencida.id}/pdf?descargar=1`,
    )
    await page.keyboard.press('Escape')

    await tabla.getByRole('button', { name: `Duplicar la ${aprobada.numero}` }).click()
    await expect(page.getByText(`Se creó un borrador a partir de la ${aprobada.numero}`)).toBeVisible()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    const copia = new URL(page.url()).pathname.split('/').pop()
    expect(copia).not.toBe(aprobada.id)
    const { rows } = await conBase((db) =>
      db.query<{ estado: string; reemplaza_a: string | null }>(
        `select estado, reemplaza_a from public.cotizaciones where id = $1`,
        [copia],
      ),
    )
    // Mismo cliente: la copia queda como renegociación de la aprobada.
    expect(rows).toEqual([{ estado: 'borrador', reemplaza_a: aprobada.id }])
    // Las demás pruebas cuentan 29: la copia se borra acá.
    await conBase((db) => db.query(`delete from public.cotizaciones where id = $1`, [copia]))
  })

  test('parámetros inválidos o una página que no existe no rompen la lista', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones?estado=cualquiera&pagina=-3&cliente=abc&desde=ayer&hasta=2026-13-45')
    await expect(page.getByRole('heading', { name: 'Cotizaciones', level: 1 })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Estado' })).toHaveValue('')

    await page.goto(`${LISTA}&pagina=99`)
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()
  })

  test.describe('en el celular', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('lista en tarjetas y filtros en una hoja', async ({ page }) => {
      await abrirLista(page)
      await expect(page.getByRole('table')).toHaveCount(0)
      await expect(page.getByRole('link', { name: `N° ${vencida.numero}`, exact: true })).toBeVisible()
      await expect(page.getByText(`Venció el ${vencida.vence_el}`)).toBeVisible()

      await page.getByRole('button', { name: /^Filtros/ }).click()
      const hoja = page.getByRole('dialog', { name: 'Filtros' })
      await hoja.getByRole('combobox', { name: 'Estado' }).selectOption('vencida')
      await hoja.getByRole('button', { name: 'Ver resultados' }).click()
      await expect(page).toHaveURL(/estado=vencida/)
      await expect(page.getByRole('link', { name: /^N° \d+$/ })).toHaveCount(1)

      await page.getByRole('button', { name: 'Quitar filtro Vencida' }).click()
      await expect(page).not.toHaveURL(/estado=/)
      await expect(page.getByRole('link', { name: /^N° \d+$/ })).toHaveCount(25)
    })
  })
})
