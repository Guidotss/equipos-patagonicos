// tests/e2e/cotizaciones.spec.ts
import { expect, test, type Page, type Request } from '@playwright/test'
import pg from 'pg'
import { borrarCotizaciones, conBase, crearCotizacionCompleta, DATOS_COMPLETOS } from './base-datos'
import { iniciarSesion, sufijoUnico } from './helpers'

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
      // 25 borradores con equipo, ubicación y variables en el asunto: la lista muestra el equipo y la ubicación.
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
    // Trabajo: "{equipo} · {ubicación}" (no el asunto, que repite el N°), sin variables a la vista.
    await expect(filas.filter({ hasText: 'Grúa telescópica XCMG QY70K-1 40 TN · Añelo' }).first()).toBeVisible()
    await expect(tabla).not.toContainText('{{')
    await expect(tabla).not.toContainText('Cotización N°')

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

    const estado = page.getByRole('combobox', { name: 'Estado' })
    await estado.focus()
    await estado.selectOption('vencida')
    await expect(page).toHaveURL(/estado=vencida/)
    await expect(filas).toHaveCount(2)
    // Aplicar el filtro no vuelve a montar el select: el foco sigue ahí para seguir con el teclado.
    await expect(estado).toBeFocused()
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
    await expect(buscador).toBeFocused()
    // Atrás y adelante con el foco todavía en el buscador: el texto sigue a la URL (no se tipeó nada después).
    await page.goBack()
    await expect(page).not.toHaveURL(/q=/)
    await expect(buscador).toBeFocused()
    await expect(buscador).toHaveValue('')
    await page.goForward()
    await expect(page).toHaveURL(/q=/)
    await expect(buscador).toHaveValue(`sin resultados ${clave}`)
    await page.getByRole('link', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL(/\/cotizaciones$/)
    // Los campos vuelven a leer la URL cuando cambia desde afuera: "Limpiar filtros" y atrás del navegador.
    const cliente = page.getByRole('combobox', { name: 'Cliente' })
    await expect(buscador).toHaveValue('')
    await expect(cliente).toHaveValue('')
    await page.goBack()
    await expect(buscador).toHaveValue(`sin resultados ${clave}`)
    await expect(cliente).not.toHaveValue('')
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

// ── Editor: estructura, cliente, datos y guardado (Task 8) ──

const MARCA_EDITOR = 'e2e-editor'

async function conBaseEditor<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** La opción del Atte. de un cliente sin contactos (ya leídos): reemplaza la línea "Este cliente no tiene contactos". */
function opcionSinContactos(page: Page) {
  return page.getByLabel('Atte.', { exact: true }).getByRole('option', { name: 'Sin contactos', exact: true })
}

/** El id de la cotización abierta en el editor (`/cotizaciones/{id}`). */
function idDeLaUrl(url: string): string {
  return new URL(url).pathname.split('/').at(-1)!
}

test.describe('editor de cotizaciones', () => {
  const creadas: string[] = []
  const clientesCreados: string[] = []

  test.afterAll(async () => {
    await conBaseEditor(async (db) => {
      await db.query('delete from public.cotizaciones where id = any($1::uuid[]) or notas = $2', [creadas, MARCA_EDITOR])
      await db.query('delete from public.clientes where razon_social = any($1::text[])', [clientesCreados])
    })
  })

  test('crea una cotización con alta rápida de cliente y la guarda', async ({ page }) => {
    const razonSocial = `Montajes Ñire ${sufijoUnico()} S.R.L.`
    clientesCreados.push(razonSocial)
    await iniciarSesion(page)
    await page.goto('/cotizaciones/nueva')
    await expect(page.getByRole('heading', { name: 'Nueva cotización' })).toBeVisible()

    // Sin cliente no se guarda: el error queda en el combo y el foco va ahí.
    const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(cliente).toHaveAttribute('aria-invalid', 'true')
    await expect(cliente).toBeFocused()

    // Alta rápida: crea el cliente solo con la razón social y lo deja elegido.
    await cliente.click()
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill(razonSocial)
    await page.getByRole('option', { name: `Crear cliente «${razonSocial}»` }).click()
    await expect(cliente).toContainText(razonSocial)
    await expect(opcionSinContactos(page)).toBeAttached()
    await expect(page.getByLabel('Atte.', { exact: true })).toHaveValue('')

    // Cambiar de plantilla con algo escrito a mano pide confirmación en el lugar (Escape cancela).
    const mensual = page.getByRole('radio', { name: 'Mensual' })
    const jornada = page.getByRole('radio', { name: 'Por jornada' })
    await mensual.click()
    await expect(mensual).toBeChecked()
    const asunto = page.getByLabel('Asunto', { exact: true })
    await asunto.fill('Asunto escrito a mano')
    await jornada.click()
    const confirmacion = page.getByRole('group', { name: '¿Cambiar a la plantilla «Por jornada - Grúa con operador»?' })
    await expect(confirmacion.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirmacion).toBeHidden()
    await expect(asunto).toHaveValue('Asunto escrito a mano')
    await jornada.click()
    await confirmacion.getByRole('button', { name: 'Cambiar plantilla' }).click()
    await expect(jornada).toBeChecked()
    await expect(asunto).toHaveValue(/^Cotización N° \{\{numero\}\}/)

    // Un dato vacío que usa el texto muestra la marca de la variable (no es su valor).
    await page.getByLabel('Equipo', { exact: true }).selectOption({ label: 'Grúa telescópica XCMG 70 TN' })
    const lugar = page.getByLabel('Lugar del servicio', { exact: true })
    const marca = lugar.locator('..').getByText('{{ubicacion}}')
    await expect(lugar).toHaveValue('')
    await expect(marca).toBeVisible()
    await lugar.fill('Añelo, Neuquén')
    await expect(marca).toBeHidden()

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    creadas.push(idDeLaUrl(page.url()))
    await expect(page.getByRole('heading', { name: /^Cotización N° \d+$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()

    // Lo guardado vuelve igual al recargar; el formato ya no se elige.
    await page.reload()
    await expect(cliente).toContainText(razonSocial)
    await expect(jornada).toHaveCount(0)
    await expect(lugar).toHaveValue('Añelo, Neuquén')
    await expect(page.getByLabel('Equipo', { exact: true }).locator('option:checked')).toHaveText(
      'Grúa telescópica XCMG 70 TN',
    )

    // Ctrl/⌘+S guarda.
    await lugar.fill('Añelo, Neuquén (yacimiento)')
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  test('Enter elige el cliente del texto escrito, no uno de la búsqueda anterior', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones/nueva')
    const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
    await cliente.click()
    // La lista inicial ya llegó y su primer cliente no es el que se va a buscar.
    const opciones = page.getByRole('listbox').getByRole('option')
    const primera = opciones.first()
    await expect(primera).toBeVisible()
    await expect(primera).not.toContainText('VERTICE')

    // Tipear y apretar Enter enseguida (antes de que llegue la búsqueda) no elige el primero de la lista anterior.
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('vertice')
    await page.keyboard.press('Enter')
    await expect(cliente).toContainText('Buscá o creá un cliente')

    // Cuando llega la lista del texto escrito, Enter elige su primer cliente.
    await expect(primera).toContainText('VERTICE SERVICIOS INTEGRALES S.R.L.')
    await page.keyboard.press('Enter')
    await expect(cliente).toContainText('VERTICE SERVICIOS INTEGRALES S.R.L.')
  })

  test('la fecha y la próxima actualización se tipean con el teclado, año incluido', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones/nueva')

    // Al tipear el año, Chrome pasa por 0002, 0020 y 0202: el campo no vuelve a la fecha anterior en cada tecla.
    const fecha = page.getByLabel('Fecha', { exact: true })
    await fecha.fill('2026-10-25')
    await fecha.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('2027')
    await expect(fecha).toHaveValue('2027-10-25')
    await expect(page.getByText(/· 25\/10\/2027$/)).toBeVisible()

    // Lo que no llegó a ser una fecha vuelve, al salir, a la que quedó.
    await fecha.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('2')
    await expect(fecha).toHaveValue('0002-10-25')
    await page.getByLabel('Validez (días)', { exact: true }).click()
    await expect(fecha).toHaveValue('2027-10-25')

    // En la próxima actualización, los años a medio escribir (0002-11…) no rompen la pantalla.
    const proxima = page.getByLabel('Próxima actualización', { exact: true })
    await proxima.focus()
    await page.keyboard.type('11')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('2027')
    await expect(proxima).toHaveValue('2027-11')
    await expect(page.getByText('En el PDF: «noviembre de 2027»')).toBeVisible()
  })

  test('una cotización cargada se muestra en solo lectura', async ({ page }) => {
    const { id, numero } = await conBaseEditor(async (db) => {
      const { rows } = await db.query<{ id: string; numero: string }>(
        `insert into public.cotizaciones (cliente_id, formato, origen, estado, archivo_original_path, asunto, notas)
         select id, 'jornada', 'importada', 'enviada', 'importadas/e2e-editor.pdf', 'Montaje de tanque', $1
         from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.'
         returning id, numero`,
        [MARCA_EDITOR],
      )
      return rows[0]
    })

    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: `Cotización N° ${numero}` })).toBeVisible()
    await expect(page.getByText('Cargada desde un PDF.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver el PDF original' })).toHaveAttribute('href', `/cotizaciones/${id}/pdf`)
    await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0)
  })
})

// ── Editor: grilla de ítems (Task 9) ──

test('la grilla de ítems se maneja con el teclado y entiende precios pegados', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/cotizaciones/nueva')
  await page.getByRole('radio', { name: 'Por jornada' }).click()
  await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()

  const descripcion = (numero: number) => page.getByLabel(`Descripción del ítem ${numero}`, { exact: true })
  const precio = (numero: number) => page.getByLabel(`Precio del ítem ${numero}`, { exact: true })

  // La plantilla por jornada trae tres ítems sin precio en dos secciones.
  await expect(descripcion(1)).toHaveValue(/^Alquiler jornada de Grúa Telescópica/)
  await expect(page.getByLabel('Nombre de la sección 1', { exact: true })).toHaveValue('Precios Jornada')
  await expect(page.getByLabel('Nombre de la sección 2', { exact: true })).toHaveValue('Precios Jornada Adicional')

  // Un precio pegado sin formato queda con formato al salir del campo y calcula el total de la línea.
  await precio(1).fill('1950000')
  await page.getByLabel('Cantidad del ítem 1', { exact: true }).fill('2')
  await expect(precio(1)).toHaveValue('1.950.000,00')
  await expect(page.getByText('3.900.000,00')).toBeVisible()

  // Enter agrega una fila debajo (en la misma sección) y la enfoca; Tab recorre la fila.
  await descripcion(1).press('Enter')
  await expect(descripcion(2)).toBeFocused()
  await expect(descripcion(2)).toHaveValue('')
  await page.keyboard.type('Hora adicional de grúa')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Cantidad del ítem 2', { exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(precio(2)).toBeFocused()
  await page.keyboard.type('$ 195.000')
  await page.keyboard.press('Tab')
  await expect(precio(2)).toHaveValue('195.000,00')
  await expect(page.getByLabel('Nombre de la sección 2', { exact: true })).toHaveValue('Precios Jornada Adicional')

  // El menú del agarre: subir y eliminar (el foco queda en la fila vecina).
  await page.getByRole('button', { name: 'Opciones del ítem 2' }).click()
  await page.getByRole('menuitem', { name: 'Subir' }).click()
  await expect(descripcion(1)).toHaveValue('Hora adicional de grúa')
  await page.getByRole('button', { name: 'Opciones del ítem 1' }).click()
  await page.getByRole('menuitem', { name: 'Eliminar' }).click()
  await expect(descripcion(1)).toHaveValue(/^Alquiler jornada de Grúa Telescópica/)
  await expect(descripcion(1)).toBeFocused()

  // Enter en el agarre abre el menú una sola vez (queda abierto) y Escape lo cierra.
  const agarre = page.getByRole('button', { name: 'Opciones del ítem 2' })
  await agarre.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toHaveCount(1)
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(agarre).toBeFocused()

  // Reordenar con el teclado: Espacio toma el ítem (sin abrir el menú), la flecha lo mueve y Espacio lo suelta.
  await page.keyboard.press('Space')
  await expect(agarre).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.keyboard.press('ArrowUp')
  await expect(page.getByText('El ítem 2 pasa a la posición 1.')).toBeAttached()
  await page.keyboard.press('Space')
  await expect(descripcion(1)).toHaveValue('Movilización y desmovilización de Grúa Telescópica')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // El clic de un lector de pantalla en modo exploración (sintético, detail 0) abre el menú, también en el agarre
  // que se acaba de arrastrar con el teclado.
  await page.getByRole('button', { name: 'Opciones del ítem 1' }).dispatchEvent('click')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // Total en el PDF: mientras falten precios, lo avisa.
  await page.getByRole('switch', { name: 'Total en el PDF' }).click()
  await expect(page.getByText('Falta el precio de 2 ítems')).toBeVisible()
})

test('los errores de guardado siguen en su ítem cuando se agregan o mueven otros', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/cotizaciones/nueva')
  await page.getByRole('radio', { name: 'Por jornada' }).click()
  await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()
  const descripcion = (numero: number) => page.getByLabel(`Descripción del ítem ${numero}`, { exact: true })

  // El ítem 3 sin descripción no se guarda: queda marcado con el motivo.
  await descripcion(3).fill('')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(descripcion(3)).toHaveAttribute('aria-invalid', 'true')
  await expect(descripcion(3)).toHaveAccessibleDescription('Falta la descripción')

  // Una fila nueva arriba corre el ítem vacío al 4: la marca va con él y no queda en el que ahora es el 3.
  await descripcion(1).press('Enter')
  await expect(descripcion(4)).toHaveValue('')
  await expect(descripcion(4)).toHaveAttribute('aria-invalid', 'true')
  await expect(descripcion(4)).toHaveAccessibleDescription('Falta la descripción')
  await expect(descripcion(3)).toHaveValue(/^Movilización y desmovilización/)
  await expect(descripcion(3)).toHaveAttribute('aria-invalid', 'false')
  await expect(descripcion(2)).toHaveAttribute('aria-invalid', 'false')

  // Al subirlo, también.
  await page.getByRole('button', { name: 'Opciones del ítem 4' }).click()
  await page.getByRole('menuitem', { name: 'Subir' }).click()
  await expect(descripcion(3)).toHaveValue('')
  await expect(descripcion(3)).toHaveAttribute('aria-invalid', 'true')
  await expect(descripcion(4)).toHaveAttribute('aria-invalid', 'false')
})

test('arrastrar el primer ítem de una sección con el mouse no pierde el nombre a medio escribir', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/cotizaciones/nueva')
  await page.getByRole('radio', { name: 'Por jornada' }).click()
  await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()
  const descripcion = (numero: number) => page.getByLabel(`Descripción del ítem ${numero}`, { exact: true })
  const seccion = page.getByLabel('Nombre de la sección 1', { exact: true })
  await expect(descripcion(1)).toHaveValue(/^Alquiler jornada de Grúa Telescópica/)
  await expect(descripcion(2)).toHaveValue('Movilización y desmovilización de Grúa Telescópica')

  // Un clic en el agarre abre su menú y otro clic lo cierra (no lo vuelve a abrir).
  const agarre = page.getByRole('button', { name: 'Opciones del ítem 1' })
  await agarre.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await agarre.click()
  await expect(page.getByRole('menu')).toHaveCount(0)

  // El nombre sin aplicar (el foco sigue en el campo) y el primer ítem de la sección arrastrado debajo del segundo:
  // el encabezado pasa a ser el del otro ítem, pero el nombre nuevo queda.
  await seccion.fill('Jornada de grúa (70 TN)')
  // Los dos ítems a la vista para el mouse (sin mover el foco).
  await descripcion(2).scrollIntoViewIfNeeded()
  await expect(seccion).toBeFocused()
  const desde = (await agarre.boundingBox())!
  const hasta = (await descripcion(2).boundingBox())!
  const x = desde.x + desde.width / 2
  await page.mouse.move(x, desde.y + desde.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, desde.y + desde.height / 2 + 12, { steps: 4 })
  await page.mouse.move(x, hasta.y + hasta.height + 24, { steps: 12 })
  await page.mouse.up()

  await expect(descripcion(1)).toHaveValue('Movilización y desmovilización de Grúa Telescópica')
  await expect(descripcion(2)).toHaveValue(/^Alquiler jornada de Grúa Telescópica/)
  await expect(seccion).toHaveValue('Jornada de grúa (70 TN)')
  await expect(page.getByLabel('Nombre de la sección 2', { exact: true })).toHaveValue('Precios Jornada Adicional')
})

test.describe('grilla de ítems de una cotización guardada', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBaseEditor((db) => db.query('delete from public.cotizaciones where id = any($1::uuid[])', [creadas]))
  })

  /** Un borrador por jornada con dos ítems con precio, cada uno en su sección (los precios llegan como "195.000"). */
  async function cotizacionGuardada(): Promise<string> {
    return conBaseEditor(async (db) => {
      const {
        rows: [{ id }],
      } = await db.query<{ id: string }>(
        `insert into public.cotizaciones (cliente_id, formato, notas)
         select id, 'jornada', $1 from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.'
         returning id`,
        [MARCA_EDITOR],
      )
      // Se anota ya: si falla el insert de los ítems, el afterAll igual la borra.
      creadas.push(id)
      await db.query(
        `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, cantidad, precio_unitario, unidad)
         values ($1, 1, 'Precios Jornada', 'Alquiler jornada de grúa', 1, 1950000, 'JORNADA'),
                ($1, 2, 'Precios Jornada Adicional', 'Hora adicional de grúa', 1, 195000, 'HORA')`,
        [id],
      )
      return id
    })
  }

  test('entrar con Tab a un precio cargado y tipear lo reemplaza', async ({ page }) => {
    const id = await cotizacionGuardada()
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const precio = page.getByLabel('Precio del ítem 2', { exact: true })
    await expect(precio).toHaveValue('195.000,00')

    await page.getByLabel('Cantidad del ítem 2', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(precio).toBeFocused()
    await page.keyboard.type('210000')
    await page.keyboard.press('Tab')
    await expect(precio).toHaveValue('210.000,00')

    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await page.reload()
    await expect(precio).toHaveValue('210.000,00')
  })

  test('Ctrl/⌘+S con el foco en el nombre de una sección guarda el nombre nuevo', async ({ page }) => {
    const id = await cotizacionGuardada()
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const seccion = page.getByLabel('Nombre de la sección 1', { exact: true })
    await expect(seccion).toHaveValue('Precios Jornada')

    await seccion.fill('Precios Jornada (equipo de 70 TN)')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    await expect(seccion).toHaveValue('Precios Jornada (equipo de 70 TN)')

    await page.reload()
    await expect(seccion).toHaveValue('Precios Jornada (equipo de 70 TN)')
  })

  test('un solo clic en Guardar guarda el nombre de sección que se está escribiendo', async ({ page }) => {
    const id = await cotizacionGuardada()
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const seccion = page.getByLabel('Nombre de la sección 2', { exact: true })
    const guardar = page.getByRole('button', { name: 'Guardar' })
    await expect(seccion).toHaveValue('Precios Jornada Adicional')
    await expect(guardar).toBeDisabled()

    // El nombre a medio escribir (todavía en el campo) ya cuenta como cambio sin guardar.
    await seccion.fill('Horas adicionales de grúa')
    await expect(seccion).toBeFocused()
    await expect(guardar).toBeEnabled()
    await guardar.click()
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(guardar).toBeDisabled()
    await expect(seccion).toHaveValue('Horas adicionales de grúa')

    await page.reload()
    await expect(seccion).toHaveValue('Horas adicionales de grúa')
  })

  test('Guardar aplica el nombre de sección aunque el campo no pierda el foco antes del clic', async ({ page }) => {
    const id = await cotizacionGuardada()
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const seccion = page.getByLabel('Nombre de la sección 1', { exact: true })
    await expect(seccion).toHaveValue('Precios Jornada')

    // Un click sin mousedown: no hay blur antes (lo que no está asegurado en Safari ni en iOS).
    await seccion.fill('Jornadas de grúa')
    await page.getByRole('button', { name: 'Guardar' }).dispatchEvent('click')
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(seccion).toHaveValue('Jornadas de grúa')

    await page.reload()
    await expect(seccion).toHaveValue('Jornadas de grúa')
  })
})

// ── Editor: textos (Task 10) ──

test.describe('textos del editor', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBaseEditor((db) => db.query('delete from public.cotizaciones where id = any($1::uuid[])', [creadas]))
  })

  test('textos: formato sobre la selección, pegar desde Word, ocultar y restaurar desde la plantilla', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones/nueva')
    await page.getByRole('radio', { name: 'Por jornada' }).click()
    await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()

    // La barra actúa sobre lo seleccionado en el textarea.
    const equipo = page.getByRole('article', { name: 'Equipo ofrecido' })
    const contenido = equipo.getByLabel(/^Contenido del bloque \d+$/)
    await contenido.click()
    await contenido.press('ControlOrMeta+a')
    await equipo.getByRole('button', { name: 'Negrita' }).click()
    await expect(contenido).toHaveValue('**{{equipo_descripcion}}**')
    await equipo.getByRole('button', { name: 'Viñeta', exact: true }).click()
    await expect(contenido).toHaveValue('- **{{equipo_descripcion}}**')
    await equipo.getByRole('button', { name: 'Subviñeta' }).click()
    await expect(contenido).toHaveValue('  - **{{equipo_descripcion}}**')
    await equipo.getByRole('button', { name: 'Quitar sangría' }).click()
    await expect(contenido).toHaveValue('- **{{equipo_descripcion}}**')

    // Lo pegado desde Word (viñetas • y o con tabs, saltos \r\n) entra en el formato mínimo. El evento se arma a mano
    // porque el portapapeles del navegador sin interfaz no se puede escribir.
    await contenido.press('ControlOrMeta+a')
    await contenido.evaluate((area) => {
      const datos = new DataTransfer()
      datos.setData('text/plain', '•\tPrimera\r\no\tSegunda')
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }))
    })
    await expect(contenido).toHaveValue('- Primera\n  - Segunda')
    // El pegado limpio entra al historial del textarea: Ctrl/⌘+Z recupera lo que reemplazó y rehacer lo vuelve a poner.
    await contenido.press('ControlOrMeta+z')
    await expect(contenido).toHaveValue('- **{{equipo_descripcion}}**')
    await contenido.press('ControlOrMeta+Shift+z')
    await expect(contenido).toHaveValue('- Primera\n  - Segunda')

    // Restaurar este bloque, con confirmación en el lugar.
    await equipo.getByRole('button', { name: 'Restaurar este bloque' }).click()
    await equipo
      .getByRole('group', { name: '¿Restaurar este bloque desde la plantilla?' })
      .getByRole('button', { name: 'Restaurar' })
      .click()
    await expect(contenido).toHaveValue('{{equipo_descripcion}}')
    await expect(equipo.getByRole('button', { name: 'Restaurar este bloque' })).toHaveCount(0)

    // Ocultar: el bloque se pliega sin perderse y el foco queda en "Mostrar".
    const alcance = page.getByRole('article', { name: 'Alcance' })
    const ocultarAlcance = alcance.getByRole('button', { name: 'Ocultar en esta cotización' })
    await ocultarAlcance.click()
    await expect(alcance.getByText('Oculto en esta cotización')).toBeVisible()
    await expect(alcance.getByRole('button', { name: 'Mostrar' })).toBeFocused()

    // Restaurar todo pide confirmación; Escape cancela y no cambia nada.
    const restaurarTodosBoton = page.getByRole('button', { name: 'Restaurar desde la plantilla' })
    await restaurarTodosBoton.click()
    const restaurarTodos = page.getByRole('group', { name: /^¿Restaurar todos los textos/ })
    await expect(restaurarTodos.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(restaurarTodos).toBeHidden()
    await expect(alcance.getByText('Oculto en esta cotización')).toBeVisible()

    // Confirmado, vuelven los textos de la plantilla: Alcance otra vez visible y ya no hay nada que restaurar.
    await restaurarTodosBoton.click()
    await restaurarTodos.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await expect(restaurarTodos).toBeHidden()
    await expect(ocultarAlcance).toBeVisible()
    await expect(alcance.getByText('Oculto en esta cotización')).toHaveCount(0)
    await expect(restaurarTodosBoton).toHaveCount(0)

    // El bloque oculto se guarda así y vuelve tal cual con "Mostrar".
    await ocultarAlcance.click()
    await expect(alcance.getByText('Oculto en esta cotización')).toBeVisible()
    const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
    await cliente.click()
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('vertice')
    await page.getByRole('option', { name: /VERTICE SERVICIOS INTEGRALES/ }).click()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    creadas.push(idDeLaUrl(page.url()))
    await expect(page.getByRole('heading', { name: /^Cotización N° \d+$/ })).toBeVisible()

    const alcanceGuardado = page.getByRole('article', { name: 'Alcance' })
    await expect(alcanceGuardado.getByText('Oculto en esta cotización')).toBeVisible()
    await alcanceGuardado.getByRole('button', { name: 'Mostrar' }).click()
    await expect(alcanceGuardado.getByLabel(/^Contenido del bloque \d+$/)).toHaveValue(/Horario de \{\{horario\}\}/)
  })
})

/** La respuesta del POST de la vista previa (el panel la pide sola al abrir y con "Actualizar vista previa"). */
function respuestaVistaPrevia(page: Page) {
  return page.waitForResponse(
    (respuesta) => respuesta.url().endsWith('/cotizaciones/vista-previa') && respuesta.request().method() === 'POST',
  )
}

test.describe('vista previa del editor', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBase((db) => borrarCotizaciones(db, creadas))
  })

  test('se genera con lo que hay en pantalla y avisa cuando quedó vieja', async ({ page }) => {
    const { id } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)

    const primera = respuestaVistaPrevia(page)
    await page.goto(`/cotizaciones/${id}`)
    const respuesta = await primera
    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['content-type']).toBe('application/pdf')

    const panel = page.getByRole('region', { name: 'Vista previa' })
    await expect(panel.getByTitle('Vista previa del PDF', { exact: true })).toHaveAttribute(
      'src',
      /^blob:.+#toolbar=0&navpanes=0&view=FitH$/,
    )
    await expect(panel.getByText('Con lo que hay en pantalla, aunque no esté guardado')).toBeVisible()

    await page.getByLabel('Asunto', { exact: true }).fill('Alquiler de grúa para Loma Campana')
    await expect(panel.getByText('Hay cambios sin reflejar')).toBeVisible()

    const segunda = respuestaVistaPrevia(page)
    await panel.getByRole('button', { name: 'Actualizar vista previa' }).click()
    const cuerpo = JSON.parse((await segunda).request().postData() ?? '{}') as { estado: { asunto: string } }
    expect(cuerpo.estado.asunto).toBe('Alquiler de grúa para Loma Campana')
    await expect(panel.getByText('Hay cambios sin reflejar')).toBeHidden()
  })

  test('una aprobada muestra el PDF guardado y no se actualiza', async ({ page }) => {
    const { id } = await conBase((db) => crearCotizacionCompleta(db, { estado: 'aprobada' }))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const panel = page.getByRole('region', { name: 'Vista previa' })
    await expect(panel.getByTitle('Vista previa del PDF', { exact: true })).toHaveAttribute(
      'src',
      `/cotizaciones/${id}/pdf#toolbar=0&navpanes=0&view=FitH`,
    )
    await expect(panel.getByText(/^PDF aprobado el \d{2}\/\d{2}\/\d{4}$/)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Actualizar vista previa' })).toHaveCount(0)
  })

  test('con la sesión cerrada avisa que venció en vez de dibujar el login en la hoja', async ({ page }) => {
    const { id } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    const primera = respuestaVistaPrevia(page)
    await page.goto(`/cotizaciones/${id}`)
    await primera

    // Sin cookies, el proxy redirige el POST al login (307) antes de que llegue a la ruta.
    await page.context().clearCookies()
    const panel = page.getByRole('region', { name: 'Vista previa' })
    await panel.getByRole('button', { name: 'Actualizar vista previa' }).click()
    await expect(panel.getByRole('alert')).toContainText('Tu sesión venció: volvé a ingresar para ver la vista previa.')
    await expect(panel.getByTitle('Vista previa del PDF', { exact: true })).toHaveCount(0)
  })

  test.describe('sin la columna fija', () => {
    test.use({ viewport: { width: 1024, height: 768 } })

    test('una aprobada no carga el PDF en la columna oculta: aparece al abrir el panel lateral', async ({ page }) => {
      const { id } = await conBase((db) => crearCotizacionCompleta(db, { estado: 'aprobada' }))
      creadas.push(id)
      await iniciarSesion(page)
      await page.goto(`/cotizaciones/${id}`)

      const visor = page.getByTitle('Vista previa del PDF', { exact: true })
      await expect(visor).toHaveCount(0)
      await page.getByRole('button', { name: 'Vista previa' }).click()
      const lateral = page.getByRole('dialog', { name: 'Vista previa del PDF' })
      await expect(lateral.getByTitle('Vista previa del PDF', { exact: true })).toHaveAttribute(
        'src',
        `/cotizaciones/${id}/pdf#toolbar=0&navpanes=0&view=FitH`,
      )
      // El del panel lateral es el único: la columna oculta sigue sin visor.
      await expect(visor).toHaveCount(1)
    })
  })

  test.describe('en el celular', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('sin cliente, "Vista previa" marca el cliente y no abre una pestaña en blanco', async ({ page }) => {
      await iniciarSesion(page)
      await page.goto('/cotizaciones/nueva')
      await expect(page.getByRole('heading', { name: 'Nueva cotización' })).toBeVisible()
      const pestanas: Page[] = []
      page.context().on('page', (pestana) => pestanas.push(pestana))

      const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
      await page.getByRole('button', { name: 'Vista previa' }).click()
      await expect(cliente).toHaveAttribute('aria-invalid', 'true')
      expect(pestanas).toHaveLength(0)
    })
  })
})

/** Un cliente con un contacto, para ver qué ofrece Atte. (VERTICE, el de crearCotizacionCompleta, no tiene). */
async function crearClienteConContacto(
  db: pg.Client,
  razonSocial: string,
): Promise<{ clienteId: string; contactoId: string }> {
  const { rows } = await db.query<{ cliente_id: string; id: string }>(
    `with cliente as (insert into public.clientes (razon_social) values ($1) returning id)
     insert into public.contactos (cliente_id, nombre) select id, 'Marisa Quintriqueo' from cliente
     returning cliente_id, id`,
    [razonSocial],
  )
  return { clienteId: rows[0].cliente_id, contactoId: rows[0].id }
}

/**
 * Alta rápida de un cliente desde el combo del editor. La acción revalida y su respuesta trae la página dibujada de
 * nuevo: se espera a que termine para que `inicial` ya tenga la versión que haya en la base en ese momento. En dev el
 * cliente a veces corta esa respuesta al pasar a la acción siguiente (la de los contactos): también cuenta.
 */
async function altaRapidaQueRevalida(page: Page, razonSocial: string) {
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
  await page.getByRole('combobox', { name: 'Buscar cliente' }).fill(razonSocial)
  const revalido = async (pedido: Request) =>
    ((await pedido.response())?.headers()['x-action-revalidated'] ?? '0') !== '0'
  const revalidacion = Promise.race([
    page.waitForEvent('requestfinished', { predicate: revalido }).catch(() => null),
    page.waitForEvent('requestfailed', { predicate: revalido }).catch(() => null),
  ])
  await page.getByRole('option', { name: `Crear cliente «${razonSocial}»` }).click()
  await revalidacion
  await expect(opcionSinContactos(page)).toBeAttached()
}

/** Hoy en Argentina, 'YYYY-MM-DD' y 'dd/mm/aaaa' (la fecha por defecto de una cotización y de su aprobación). */
function hoyArgentina() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const [anio, mes, dia] = iso.split('-')
  return { iso, corta: `${dia}/${mes}/${anio}` }
}

test.describe('acciones de estado del editor', () => {
  const creadas: string[] = []
  const clientesCreados: string[] = []

  test.afterAll(async () => {
    await conBase(async (db) => {
      await borrarCotizaciones(db, creadas)
      await db.query('delete from public.clientes where razon_social = any($1::text[])', [clientesCreados])
    })
  })

  test('rechazar y reabrir se confirman en el lugar; Escape cancela', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const rechazar = page.getByRole('group', { name: `¿Marcar la cotización N° ${numero} como rechazada?` })
    const masAcciones = page.getByRole('button', { name: 'Más acciones' })
    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Rechazar' }).click()
    // Desde el menú también: el foco queda en Cancelar y Escape cierra la confirmación (decisión 15).
    await expect(rechazar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rechazar).toBeHidden()
    await expect(masAcciones).toBeFocused()

    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Rechazar' }).click()
    await rechazar.getByRole('button', { name: 'Rechazar', exact: true }).click()
    await expect(page.getByText('Rechazada. Para volver a editarla, reabrila.')).toBeVisible()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeDisabled()

    await page.getByRole('button', { name: 'Reabrir', exact: true }).click()
    await page
      .getByRole('group', { name: `¿Reabrir la cotización N° ${numero}?` })
      .getByRole('button', { name: 'Reabrir', exact: true })
      .click()
    await expect(page.getByText('Rechazada. Para volver a editarla, reabrila.')).toBeHidden()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Descargar y marcar enviada' })).toBeEnabled()
  })

  test('aprobar pide la fecha, no acepta una anterior a la cotización y se puede revertir', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    const hoy = hoyArgentina()
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    const aprobar = page.getByRole('group', { name: `¿Aprobar la cotización N° ${numero}?` })
    const fecha = aprobar.getByLabel('Fecha de aprobación')
    await expect(fecha).toHaveValue(hoy.iso)
    await fecha.fill('2020-01-01')
    await expect(aprobar.getByText(/^No puede ser anterior a la fecha de la cotización/)).toBeVisible()
    await expect(aprobar.getByRole('button', { name: 'Aprobar', exact: true })).toBeDisabled()

    await fecha.fill(hoy.iso)
    await aprobar.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await expect(page.getByText(`Aprobada el ${hoy.corta}: es un presupuesto y no se modifica.`)).toBeVisible()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0)

    const masAcciones = page.getByRole('button', { name: 'Más acciones' })
    const revertir = page.getByRole('group', { name: `¿Revertir la aprobación de la cotización N° ${numero}?` })
    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Revertir aprobación' }).click()
    await expect(revertir.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(revertir).toBeHidden()

    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Revertir aprobación' }).click()
    await expect(revertir.getByText('Vuelve a borrador y deja de ser un presupuesto.', { exact: false })).toBeVisible()
    await revertir.getByRole('button', { name: 'Revertir', exact: true }).click()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeEnabled()
  })

  test('lo que falta completar bloquea enviar y aprobar, y cada nombre lleva al campo', async ({ page }) => {
    const { id } = await conBase((db) =>
      crearCotizacionCompleta(db, { datos: { ...DATOS_COMPLETOS, ubicacion: '' }, precioMovilizacion: null }),
    )
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const enviar = page.getByRole('button', { name: 'Descargar y marcar enviada' })
    const aprobar = page.getByRole('button', { name: 'Aprobar', exact: true })
    await expect(enviar).toBeDisabled()
    await expect(aprobar).toBeDisabled()
    const franja = page.getByText(/^Para enviar falta completar:/)
    await expect(franja).toHaveText('Para enviar falta completar: Lugar del servicio · 1 ítem sin precio')

    await franja.getByRole('button', { name: 'Lugar del servicio', exact: true }).click()
    const lugar = page.getByLabel('Lugar del servicio', { exact: true })
    await expect(lugar).toBeFocused()
    await lugar.fill('Loma Campana, Añelo')

    await franja.getByRole('button', { name: '1 ítem sin precio', exact: true }).click()
    const precio = page.getByLabel('Precio del ítem 2', { exact: true })
    await expect(precio).toBeFocused()
    await precio.fill('2.800.000')

    await expect(franja).toBeHidden()
    await expect(enviar).toBeEnabled()
    await expect(aprobar).toBeEnabled()
  })

  test('el ⋯ de la lista abre el editor con la confirmación de la transición', async ({ page }) => {
    const { id, numero } = await conBase(async (db) => {
      const creada = await crearCotizacionCompleta(db)
      await db.query(`update public.cotizaciones set estado = 'enviada' where id = $1`, [creada.id])
      return creada
    })
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones?q=${numero}`)

    await page.getByRole('table').getByRole('button', { name: `Más acciones de la ${numero}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Aprobar…' })).toHaveAttribute(
      'href',
      `/cotizaciones/${id}?accion=aprobar`,
    )
    await page.getByRole('menuitem', { name: 'Rechazar…' }).click()

    // El ?accion= se saca de la URL al entrar: recargar no vuelve a abrir la confirmación.
    await expect(page).toHaveURL(new RegExp(`/cotizaciones/${id}$`))
    const rechazar = page.getByRole('group', { name: `¿Marcar la cotización N° ${numero} como rechazada?` })
    await expect(rechazar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rechazar).toBeHidden()
  })

  test('eliminar un borrador pide confirmación y vuelve a la lista', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: 'Eliminar borrador' }).click()
    await page
      .getByRole('group', { name: `¿Eliminar el borrador N° ${numero}?` })
      .getByRole('button', { name: 'Eliminar', exact: true })
      .click()
    await expect(page).toHaveURL(/\/cotizaciones$/)
    const quedan = await conBase((db) => db.query('select 1 from public.cotizaciones where id = $1', [id]))
    expect(quedan.rowCount).toBe(0)
  })

  test('Recargar toma la versión del otro aunque una revalidación ya la haya traído', async ({ page }) => {
    const conContacto = `Hormigones Collón Curá ${sufijoUnico()} S.A.`
    clientesCreados.push(conContacto)
    const { id, contactoId } = await conBase(async (db) => {
      const { id } = await crearCotizacionCompleta(db)
      const { clienteId, contactoId } = await crearClienteConContacto(db, conContacto)
      await db.query('update public.cotizaciones set cliente_id = $2, contacto_id = $3 where id = $1', [
        id,
        clienteId,
        contactoId,
      ])
      return { id, contactoId }
    })
    creadas.push(id)
    const razonSocial = `Grúas Lanín ${sufijoUnico()} S.R.L.`
    clientesCreados.push(razonSocial)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const asunto = page.getByLabel('Asunto', { exact: true })
    const atte = page.getByLabel('Atte.')
    await expect(asunto).toBeEnabled()
    await expect(atte).toHaveValue(contactoId)

    // Otro usuario guarda mientras tanto.
    await conBase((db) =>
      db.query(`update public.cotizaciones set asunto = 'Asunto de otro usuario' where id = $1`, [id]),
    )
    // El alta rápida revalida /clientes y la página se vuelve a dibujar: `inicial` ya trae la versión del otro.
    await altaRapidaQueRevalida(page, razonSocial)
    const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
    const sinContactos = opcionSinContactos(page)

    const guardar = page.getByRole('button', { name: 'Guardar', exact: true })
    await guardar.click()
    await page.getByRole('button', { name: 'Recargar' }).click()
    await page.getByRole('button', { name: 'Descartar y recargar' }).click()
    await expect(asunto).toHaveValue('Asunto de otro usuario')
    await expect(cliente).toContainText(conContacto)
    // Atte. vuelve a ofrecer los contactos del cliente guardado, con el suyo elegido.
    await expect(atte).toHaveValue(contactoId)
    await expect(sinContactos).toHaveCount(0)

    // Con la versión del otro, guardar ya no choca.
    await asunto.fill('Asunto corregido')
    await guardar.click()
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recargar' })).toHaveCount(0)
    await expect(asunto).toHaveValue('Asunto corregido')
    const { rows } = await conBase((db) =>
      db.query<{ asunto: string }>('select asunto from public.cotizaciones where id = $1', [id]),
    )
    expect(rows[0].asunto).toBe('Asunto corregido')
  })

  test('Recargar toma la versión actual aunque una revalidación haya traído una intermedia', async ({ page }) => {
    const { id } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    const razonSocial = `Grúas Huechulafquen ${sufijoUnico()} S.R.L.`
    clientesCreados.push(razonSocial)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const asunto = page.getByLabel('Asunto', { exact: true })
    await expect(asunto).toBeEnabled()

    const otroGuarda = (texto: string) =>
      conBase((db) => db.query('update public.cotizaciones set asunto = $2 where id = $1', [id, texto]))
    // El otro guarda, el alta rápida revalida (`inicial` trae esa versión) y el otro vuelve a guardar.
    await otroGuarda('Primer guardado ajeno')
    await altaRapidaQueRevalida(page, razonSocial)
    await otroGuarda('Segundo guardado ajeno')

    const guardar = page.getByRole('button', { name: 'Guardar', exact: true })
    await guardar.click()
    await page.getByRole('button', { name: 'Recargar' }).click()
    await page.getByRole('button', { name: 'Descartar y recargar' }).click()
    // Toma la que trae el refresco, no la intermedia: un solo Recargar alcanza.
    await expect(asunto).toHaveValue('Segundo guardado ajeno')
    await expect(page.getByRole('combobox', { name: 'Cliente', exact: true })).toContainText(
      'VERTICE SERVICIOS INTEGRALES S.R.L.',
    )

    await asunto.fill('Asunto corregido')
    await guardar.click()
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recargar' })).toHaveCount(0)
  })

  test('una transición que no llega al servidor avisa y no deja pisar lo que guardó otro', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    const razonSocial = `Grúas Aluminé ${sufijoUnico()} S.R.L.`
    clientesCreados.push(razonSocial)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    const asunto = page.getByLabel('Asunto', { exact: true })
    await expect(asunto).toBeEnabled()

    // Sin red para las Server Actions de la página: rechazar no llega al servidor.
    const sinRed = (url: URL) => url.pathname === `/cotizaciones/${id}`
    await page.route(sinRed, (ruta) =>
      ruta.request().method() === 'POST' ? ruta.abort('failed') : ruta.continue(),
    )
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: 'Rechazar' }).click()
    const rechazar = page.getByRole('group', { name: `¿Marcar la cotización N° ${numero} como rechazada?` })
    await rechazar.getByRole('button', { name: 'Rechazar', exact: true }).click()
    await expect(page.getByText('No se pudo completar la operación. Probá de nuevo.')).toBeVisible()
    await expect(rechazar.getByRole('button', { name: 'Rechazar', exact: true })).toBeEnabled()
    await page.unroute(sinRed)
    await rechazar.getByRole('button', { name: 'Cancelar' }).click()

    // Otro usuario guarda; acá se edita y el alta rápida revalida: `inicial` trae la versión del otro.
    await conBase((db) =>
      db.query(`update public.cotizaciones set asunto = 'Asunto de otro usuario' where id = $1`, [id]),
    )
    await asunto.fill('Asunto local')
    await altaRapidaQueRevalida(page, razonSocial)

    // El editor no quedó esperando la versión del servidor: no la toma debajo de lo local y guardar choca.
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible()
    const { rows } = await conBase((db) =>
      db.query<{ asunto: string }>('select asunto from public.cotizaciones where id = $1', [id]),
    )
    expect(rows[0].asunto).toBe('Asunto de otro usuario')
  })

  test('después de una transición el editor toma el cliente del servidor con sus contactos', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    const conContacto = `Hormigones Pulmarí ${sufijoUnico()} S.A.`
    clientesCreados.push(conContacto)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    await expect(opcionSinContactos(page)).toBeAttached()

    // Otro usuario le cambia el cliente (con un contacto) mientras se rechaza.
    const { contactoId } = await conBase(async (db) => {
      const creado = await crearClienteConContacto(db, conContacto)
      await db.query('update public.cotizaciones set cliente_id = $2, contacto_id = $3 where id = $1', [
        id,
        creado.clienteId,
        creado.contactoId,
      ])
      return creado
    })
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: 'Rechazar' }).click()
    await page
      .getByRole('group', { name: `¿Marcar la cotización N° ${numero} como rechazada?` })
      .getByRole('button', { name: 'Rechazar', exact: true })
      .click()
    await expect(page.getByText('Rechazada. Para volver a editarla, reabrila.')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Cliente', exact: true })).toContainText(conContacto)
    await expect(page.getByLabel('Atte.')).toHaveValue(contactoId)
    await expect(opcionSinContactos(page)).toHaveCount(0)
  })
})

test.describe('flujo completo de una cotización', () => {
  const sufijo = sufijoUnico()
  const contacto = `Contacto E2E ${sufijo}`
  let contactoId: string
  const creadas: string[] = []

  test.beforeAll(async () => {
    // VERTICE no tiene contactos en la semilla: uno propio para elegir el Atte.
    contactoId = await conBase(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.contactos (cliente_id, nombre, email)
         select id, $1, $2 from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.'
         returning id`,
        [contacto, `e2e-${sufijo}@vertice.test`],
      )
      return rows[0].id
    })
  })

  test.afterAll(async () => {
    await conBase(async (db) => {
      await borrarCotizaciones(db, creadas)
      await db.query('delete from public.contactos where id = $1', [contactoId])
    })
  })

  test('de nueva a aprobada, y renegociada con el presupuesto anterior finalizado', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones')
    await page.getByRole('link', { name: 'Nueva cotización' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/nueva$/)

    // Formato (la nueva arranca con la primera plantilla por nombre: la mensual), cliente y Atte.
    await page.getByRole('radio', { name: 'Por jornada' }).click()
    await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()
    await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('vertice')
    await page.getByRole('option', { name: /VERTICE SERVICIOS INTEGRALES S\.R\.L\./ }).click()
    await page.getByLabel('Atte.', { exact: true }).selectOption({ label: contacto })

    // Datos de esta cotización (los que usa la plantilla por jornada; las etiquetas son las de VARIABLES).
    await page.getByLabel('Equipo', { exact: true }).selectOption({ label: 'Grúa telescópica XCMG 70 TN' })
    await page.getByLabel('Lugar del servicio', { exact: true }).fill('Loma Campana, Añelo')
    await page.getByLabel('Horario', { exact: true }).fill('lunes a sábado de 8 a 17 hs')
    await page.getByLabel('Tiempo estimado de contratación', { exact: true }).fill('10 jornadas')
    await page.getByLabel('Forma de pago', { exact: true }).fill('30 días fecha de factura')
    await page.getByLabel('Disponibilidad', { exact: true }).fill('inmediata')

    // Precios de los tres ítems de la plantilla, pegados como vienen de una planilla.
    await expect(page.getByLabel(/^Precio del ítem \d+$/)).toHaveCount(3)
    await page.getByLabel('Precio del ítem 1', { exact: true }).fill('1.950.000')
    await page.getByLabel('Precio del ítem 2', { exact: true }).fill('2800000')
    await page.getByLabel('Precio del ítem 3', { exact: true }).fill('2.530.000,00')

    // Sin guardar todavía: no falta nada (el número se asigna al guardar, decisión 8).
    await expect(page.getByText('Para enviar falta completar')).toBeHidden()

    // Vista previa: el PDF real de lo que hay en pantalla, aunque no esté guardado.
    const vista = respuestaVistaPrevia(page)
    await page.getByRole('button', { name: 'Actualizar vista previa' }).click()
    expect((await vista).headers()['content-type']).toBe('application/pdf')

    // Descargar y marcar enviada sin haber guardado (decisión 12): guarda, marca enviada, baja el PDF del envío con
    // el nombre de siempre y recién ahí pasa a /cotizaciones/{id}.
    const descarga = page.waitForEvent('download', {
      predicate: (archivo) => archivo.suggestedFilename().startsWith('COTIZACION'),
    })
    await page.getByRole('button', { name: 'Descargar y marcar enviada' }).click()
    const nombreArchivo = (await descarga).suggestedFilename()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').at(-1)!
    creadas.push(id)
    const titulo = page.getByRole('heading', { level: 1 })
    await expect(titulo).toHaveText(/^Cotización N° \d+$/)
    const numero = Number((await titulo.textContent())!.replace(/\D/g, ''))
    expect(nombreArchivo).toBe(`COTIZACION N° ${numero} VERTICE.pdf`)
    await expect(page.getByText(/^Enviada el \d{2}\/\d{2}\/\d{4}\. Lo que edites/)).toBeVisible()

    // Aprobar con fecha: queda congelada.
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    const aprobar = page.getByRole('group', { name: `¿Aprobar la cotización N° ${numero}?` })
    await expect(aprobar.getByLabel('Fecha de aprobación')).toHaveValue(hoyArgentina().iso)
    await aprobar.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await expect(page.getByText(/^Aprobada el \d{2}\/\d{2}\/\d{4}: es un presupuesto y no se modifica\.$/)).toBeVisible()
    await expect(page.getByLabel('Lugar del servicio', { exact: true })).toBeDisabled()

    // En la lista, con el filtro Aprobada.
    await page.goto(`/cotizaciones?estado=aprobada&q=${numero}`)
    const fila = page.getByRole('row').filter({ hasText: String(numero) })
    await expect(fila.getByText('Aprobada', { exact: true })).toBeVisible()
    await fila.getByRole('link', { name: String(numero), exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/cotizaciones/${id}$`))

    // Duplicar: un borrador nuevo que reemplaza a la aprobada.
    await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
    await expect(page).not.toHaveURL(new RegExp(`/cotizaciones/${id}$`))
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    const copia = page.url().split('/').at(-1)!
    creadas.push(copia)
    await expect(page.getByText(`Duplicada de N° ${numero}`)).toBeVisible()
    await expect(page.getByRole('link', { name: `N° ${numero}`, exact: true })).toHaveAttribute('href', `/cotizaciones/${id}`)
    const reemplaza = await conBase((db) =>
      db.query<{ reemplaza_a: string }>('select reemplaza_a from public.cotizaciones where id = $1', [copia]),
    )
    expect(reemplaza.rows[0].reemplaza_a).toBe(id)

    // Aprobar la copia (trae precios y datos, con fecha de hoy) ofrece finalizar el presupuesto que reemplaza.
    await expect(titulo).not.toHaveText(`Cotización N° ${numero}`)
    const numeroCopia = Number((await titulo.textContent())!.replace(/\D/g, ''))
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await page
      .getByRole('group', { name: `¿Aprobar la cotización N° ${numeroCopia}?` })
      .getByRole('button', { name: 'Aprobar', exact: true })
      .click()
    const finalizar = page.getByRole('group', {
      name: `Esta cotización reemplaza a la N° ${numero}, que sigue en curso como presupuesto.`,
    })
    await finalizar.getByRole('button', { name: `Finalizar el presupuesto N° ${numero}` }).click()
    await expect(page.getByText(`Se finalizó el presupuesto N° ${numero}`)).toBeVisible()
    await expect(finalizar).toBeHidden()
    const original = await conBase((db) =>
      db.query<{ presupuesto_estado: string }>('select presupuesto_estado from public.cotizaciones where id = $1', [id]),
    )
    expect(original.rows[0].presupuesto_estado).toBe('finalizado')
  })
})

test.describe('conflicto de versión', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBase((db) => borrarCotizaciones(db, creadas))
  })

  test('si otro guardó antes, avisa sin perder lo escrito y Recargar trae la versión nueva', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const asunto = page.getByLabel('Asunto', { exact: true })
    const original = await asunto.inputValue()
    await asunto.fill('Asunto cambiado en esta pestaña')

    // Otra pestaña (u otra persona) guarda: cambia la versión en la base.
    await conBase((db) => db.query('update public.cotizaciones set updated_at = now() where id = $1', [id]))

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('La cotización cambió desde que la abriste; volvé a intentarlo').first()).toBeVisible()
    await expect(asunto).toHaveValue('Asunto cambiado en esta pestaña')

    await page.getByRole('button', { name: 'Recargar' }).click()
    await page
      .getByRole('group', { name: 'Se descartan los cambios que no guardaste y se carga la versión actual.' })
      .getByRole('button', { name: 'Descartar y recargar' })
      .click()
    await expect(asunto).toHaveValue(original)

    // Con la versión nueva se vuelve a operar.
    const descarga = page.waitForEvent('download', {
      predicate: (archivo) => archivo.suggestedFilename().startsWith('COTIZACION'),
    })
    await page.getByRole('button', { name: 'Descargar y marcar enviada' }).click()
    expect((await descarga).suggestedFilename()).toBe(`COTIZACION N° ${numero} VERTICE.pdf`)
  })
})
