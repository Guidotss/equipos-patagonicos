import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sumarDays } from '@/lib/format/dates'
import { anonClient, removeUser, crearUser, sql } from './helpers'

const marca = `inicio-${crypto.randomUUID()}`
let activo: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>
let clientId: string
let today: string
let cuit: string

function cuitOfTest() {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  for (;;) {
    const base = `30${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
    const remainder = [...base].reduce((sum, digito, i) => sum + Number(digito) * weights[i], 0) % 11
    if (remainder !== 1) return base + (remainder === 0 ? 0 : 11 - remainder)
  }
}

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  cuit = cuitOfTest()
  ;[{ id: clientId }] = await sql<{ id: string }>(
    `insert into public.clientes (razon_social, cuit, telefono, email, notas)
     values ($1, $2, '299 111-2233', 'cliente@inicio.test', $3) returning id`,
    [`Grúas Ñandú ${marca}`, cuit, marca],
  )
  ;[{ today }] = await sql<{ today: string }>(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text as hoy`)
})

afterAll(async () => {
  if (clientId) {
    await sql('delete from public.op_facturas where op_id in (select id from public.documentos where cliente_id = $1)', [clientId])
    await sql('update public.documentos set factura_id = null where cliente_id = $1', [clientId])
    await sql('delete from public.documentos where cliente_id = $1', [clientId])
    await sql('delete from public.cotizaciones where cliente_id = $1', [clientId])
    await sql('delete from public.clientes where id = $1', [clientId])
  }
  if (activo) await removeUser(activo.id)
  if (inactivo) await removeUser(inactivo.id)
})

async function quote(options: {
  hace?: number; validity?: number; aprobada?: boolean; actualizacion?: number; finalizada?: boolean; importada?: boolean
} = {}) {
  const [row] = await sql<{ id: string; numero: string }>(
    `insert into public.cotizaciones
       (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, fecha_aprobacion, presupuesto_estado,
        fecha_proxima_actualizacion, origen, archivo_original_path)
     values ($1, 'jornada', $2, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, numero::text`,
    [clientId, marca, sumarDays(today, -(options.hace ?? 0)), options.validity ?? 30,
      options.aprobada ? 'aprobada' : 'enviada', options.aprobada ? today : null,
      options.aprobada ? options.finalizada ? 'finalizado' : 'en_curso' : null,
      options.actualizacion === undefined ? null : sumarDays(today, options.actualizacion),
      options.importada ? 'importada' : 'app', options.importada ? `${marca}/original.pdf` : null],
  )
  return row
}

async function envio(id: string, hace: number) {
  await sql(
    `insert into public.cotizacion_envios (cotizacion_id, pdf_path, enviada_at)
     values ($1, $2, ($3::date + time '12:00') at time zone 'America/Argentina/Buenos_Aires')`,
    [id, `${marca}/envio.pdf`, sumarDays(today, -hace)],
  )
}

async function document(tipo: 'factura' | 'orden_compra' | 'orden_pago' | 'remito', budgets: string[], numero: string = tipo, monto = 1000) {
  const [row] = await sql<{ id: string }>(
    `insert into public.documentos (cliente_id, tipo, numero, notas, monto, tipo_comprobante, fecha)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [clientId, tipo, numero, marca, ['factura', 'orden_pago'].includes(tipo) ? monto : null, tipo === 'factura' ? 'FA' : null, sumarDays(today, -45)],
  )
  for (const id of budgets) await sql('insert into public.documento_presupuestos values ($1, $2)', [row.id, id])
  return row.id
}

async function pendingListPropios(cola: string) {
  const { data, error } = await activo.client.from('v_inicio_colas').select('*').eq('cliente_id', clientId).eq('cola', cola)
  if (error) throw error
  return data
}

describe('Inicio: límites, unicidad y seguridad', () => {
  it('usa el último envío argentino, >5 días, vencimiento inclusivo a 7 y fallback de importadas', async () => {
    const cinco = await quote({ hace: 10 })
    await envio(cinco.id, 10)
    await envio(cinco.id, 5)
    const seis = await quote({ hace: 10 })
    await envio(seis.id, 6)
    const siete = await quote({ hace: 23 })
    await envio(siete.id, 1)
    const ocho = await quote({ hace: 22 })
    await envio(ocho.id, 1)
    const vencida = await quote({ hace: 31 })
    await envio(vencida.id, 1)
    const imported = await quote({ hace: 6, importada: true })
    const [{ id: contacto }] = await sql<{ id: string }>(
      `insert into public.contactos (cliente_id, nombre, telefono) values ($1, 'Persona elegida', '299 999-4455') returning id`, [clientId],
    )
    await sql('update public.cotizaciones set contacto_id = $1 where id = $2', [contacto, seis.id])
    const rows = await pendingListPropios('seguimiento')
    expect(rows.map((f) => f.id).sort()).toEqual([seis.id, siete.id, vencida.id, imported.id].sort())
    expect(rows.find((f) => f.id === seis.id)).toMatchObject({ telefono: '299 999-4455', email: 'cliente@inicio.test', dias: 6 })
  })

  it('falta OC ignora anuladas y finalizados; actualización incluye vencidas y exactamente 30 días', async () => {
    const withoutOc = await quote({ aprobada: true, actualizacion: 30 })
    const withOc = await quote({ aprobada: true, actualizacion: 31 })
    const vencida = await quote({ aprobada: true, actualizacion: -1 })
    const finalizada = await quote({ aprobada: true, actualizacion: -1, finalizada: true })
    const anulada = await document('orden_compra', [withoutOc.id])
    await sql('update public.documentos set deleted_at = now() where id = $1', [anulada])
    await document('orden_compra', [withOc.id])
    expect((await pendingListPropios('falta_oc')).map((f) => f.id).sort()).toEqual([withoutOc.id, vencida.id].sort())
    const actualizaciones = (await pendingListPropios('actualizacion')).map((f) => f.id)
    expect(actualizaciones.sort()).toEqual([withoutOc.id, vencida.id].sort())
    expect(actualizaciones).not.toContain(finalizada.id)
  })

  it('cuenta remitos únicos y vuelve a incluirlos cuando su factura está anulada', async () => {
    const uno = await quote({ aprobada: true })
    const dos = await quote({ aprobada: true })
    const deliveryNote = await document('remito', [uno.id, dos.id])
    const invoice = await document('factura', [uno.id, dos.id])
    expect((await pendingListPropios('para_facturar')).filter((f) => f.id === deliveryNote)).toHaveLength(1)
    await sql('update public.documentos set factura_id = $1 where id = $2', [invoice, deliveryNote])
    expect((await pendingListPropios('para_facturar')).find((f) => f.id === deliveryNote)).toBeUndefined()
    await sql('update public.documentos set deleted_at = now() where id = $1', [invoice])
    expect((await pendingListPropios('para_facturar')).filter((f) => f.id === deliveryNote)).toHaveLength(1)
  })

  it('el total global suma el saldo de cada factura compartida una vez y descuenta pagos', async () => {
    const antes = await activo.client.rpc('inicio_resumen')
    expect(antes.error).toBeNull()
    const uno = await quote({ aprobada: true })
    const dos = await quote({ aprobada: true })
    const invoice = await document('factura', [uno.id, dos.id], 'F-COMPARTIDA', 1200)
    const pago = await document('orden_pago', [uno.id, dos.id], 'OP-COMPARTIDA', 200)
    await sql('insert into public.op_facturas values ($1, $2, 200)', [pago, invoice])
    const despues = await activo.client.rpc('inicio_resumen')
    expect(despues.error).toBeNull()
    const previous = antes.data!.find((f) => f.cola === 'cobranzas')!
    const actual = despues.data!.find((f) => f.cola === 'cobranzas')!
    expect(actual.cantidad - previous.cantidad).toBe(1)
    expect(actual.importe - previous.importe).toBe(1000)
    expect((await pendingListPropios('cobranzas')).find((f) => f.id === invoice)).toMatchObject({ importe: 1000, dias: 45 })
  })

  it('las acciones de remitos y cobros eligen un presupuesto no anulado o vuelven al documento', async () => {
    const finished = await quote({ aprobada: true, finalizada: true })
    const voided = await quote({ aprobada: true })
    await sql("update public.cotizaciones set presupuesto_estado='anulado' where id=$1", [voided.id])
    const deliveryNote = await document('remito', [finished.id, voided.id], 'R-DESTINO')
    const invoice = await document('factura', [finished.id, voided.id], 'F-DESTINO')
    expect((await pendingListPropios('para_facturar')).find((f) => f.id === deliveryNote)?.presupuesto_id).toBe(finished.id)
    expect((await pendingListPropios('cobranzas')).find((f) => f.id === invoice)?.presupuesto_id).toBe(finished.id)
    await sql("update public.cotizaciones set presupuesto_estado='anulado' where id=$1", [finished.id])
    expect((await pendingListPropios('para_facturar')).find((f) => f.id === deliveryNote)?.presupuesto_id).toBeNull()
    expect((await pendingListPropios('cobranzas')).find((f) => f.id === invoice)?.presupuesto_id).toBeNull()
  })

  it('pagina cada cola sin duplicar ni perder filas y limita el tamaño de respuesta', async () => {
    const primera = await activo.client.rpc('inicio_pendientes', { p_cola: 'seguimiento', p_limite: 1 })
    const segunda = await activo.client.rpc('inicio_pendientes', { p_cola: 'seguimiento', p_limite: 1, p_desde: 1 })
    expect(primera.error).toBeNull()
    expect(segunda.error).toBeNull()
    expect(primera.data).toHaveLength(1)
    expect(segunda.data).toHaveLength(1)
    expect(primera.data![0].id).not.toBe(segunda.data![0].id)
    const invalid = await activo.client.rpc('inicio_pendientes', { p_cola: 'inventada' })
    expect(invalid.error?.code).toBe('22023')
  })

  it('RLS oculta los datos al inactivo y anon no puede ejecutar las lecturas', async () => {
    const pendingList = await inactivo.client.rpc('inicio_pendientes')
    const resumen = await inactivo.client.rpc('inicio_resumen')
    expect(pendingList.error).toBeNull()
    expect(pendingList.data).toEqual([])
    expect(resumen.data?.every((f) => f.cantidad === 0 && f.importe === 0)).toBe(true)
    expect((await anonClient().rpc('inicio_pendientes')).error).not.toBeNull()
    expect((await anonClient().rpc('inicio_resumen')).error).not.toBeNull()
  })
})

describe('Búsqueda global', () => {
  it('encuentra razón social sin acentos y CUIT con y sin separadores', async () => {
    for (const texto of [`gruas nandu ${marca}`, cuit, `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`]) {
      const { data, error } = await activo.client.rpc('buscar_global', { texto, p_grupo: 'clientes' })
      expect(error).toBeNull()
      expect(data?.map((f) => f.id)).toEqual([clientId])
    }
  })

  it('encuentra cotización y los cuatro tipos documentales, con enlaces al registro', async () => {
    const budget = await quote({ aprobada: true })
    const found = await activo.client.rpc('buscar_global', { texto: budget.numero, p_grupo: 'cotizaciones' })
    expect(found.error).toBeNull()
    expect(found.data?.find((f) => f.id === budget.id)?.href).toBe(`/cotizaciones/${budget.id}`)
    for (const tipo of ['orden_compra', 'remito', 'factura', 'orden_pago'] as const) {
      const numero = `${tipo.replaceAll('_', '-')}-${marca}-001`
      const id = await document(tipo, [budget.id], numero)
      const { data, error } = await activo.client.rpc('buscar_global', { texto: numero.replaceAll('-', ''), p_grupo: tipo })
      expect(error).toBeNull()
      expect(data?.map((f) => f.href)).toEqual([`/documentos/${id}`])
    }
  })

  it('interpreta % y _ literalmente, valida 200 caracteres, no revela anulados y mantiene RLS', async () => {
    const budget = await quote({ aprobada: true })
    const literal = `${marca}%_literal`
    const id = await document('remito', [budget.id], literal)
    await document('remito', [budget.id], `${marca}XXXliteral`)
    const response = await activo.client.rpc('buscar_global', { texto: literal })
    expect(response.error).toBeNull()
    expect(response.data?.map((f) => f.id)).toEqual([id])
    await sql('update public.documentos set deleted_at = now() where id = $1', [id])
    expect((await activo.client.rpc('buscar_global', { texto: literal })).data).toEqual([])
    expect((await activo.client.rpc('buscar_global', { texto: 'a'.repeat(201) })).error?.code).toBe('22023')
    expect((await activo.client.rpc('buscar_global', { texto: 'a'.repeat(200) })).error).toBeNull()
    expect((await activo.client.rpc('buscar_global', { texto: '' })).data).toEqual([])
    expect((await inactivo.client.rpc('buscar_global', { texto: marca })).data).toEqual([])
    expect((await anonClient().rpc('buscar_global', { texto: marca })).error).not.toBeNull()
  })

  it('limita a 50 resultados por grupo y pagina sin perder el total', async () => {
    const prefix = `limite-${marca}`
    await sql(
      `insert into public.documentos (cliente_id, tipo, numero, notas)
       select $1, 'remito', $2 || '-' || n, $3 from generate_series(1, 55) n`,
      [clientId, prefix, marca],
    )
    const primera = await activo.client.rpc('buscar_global', { texto: prefix, p_limite: 1000 })
    const segunda = await activo.client.rpc('buscar_global', { texto: prefix, p_limite: 50, p_desde: 50 })
    expect(primera.error).toBeNull()
    expect(primera.data).toHaveLength(50)
    expect(primera.data![0].cantidad).toBe(55)
    expect(segunda.data).toHaveLength(5)
    expect(new Set([...primera.data!, ...segunda.data!].map((f) => f.id)).size).toBe(55)
  })
})
