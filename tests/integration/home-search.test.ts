import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sumarDias } from '@/lib/format/fechas'
import { anonClient, borrarUsuario, crearUsuario, sql } from './helpers'

const marca = `inicio-${crypto.randomUUID()}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let clienteId: string
let hoy: string
let cuit: string

function cuitDePrueba() {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  for (;;) {
    const base = `30${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`
    const resto = [...base].reduce((suma, digito, i) => suma + Number(digito) * pesos[i], 0) % 11
    if (resto !== 1) return base + (resto === 0 ? 0 : 11 - resto)
  }
}

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  cuit = cuitDePrueba()
  ;[{ id: clienteId }] = await sql<{ id: string }>(
    `insert into public.clientes (razon_social, cuit, telefono, email, notas)
     values ($1, $2, '299 111-2233', 'cliente@inicio.test', $3) returning id`,
    [`Grúas Ñandú ${marca}`, cuit, marca],
  )
  ;[{ hoy }] = await sql<{ hoy: string }>(`select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text as hoy`)
})

afterAll(async () => {
  if (clienteId) {
    await sql('delete from public.op_facturas where op_id in (select id from public.documentos where cliente_id = $1)', [clienteId])
    await sql('update public.documentos set factura_id = null where cliente_id = $1', [clienteId])
    await sql('delete from public.documentos where cliente_id = $1', [clienteId])
    await sql('delete from public.cotizaciones where cliente_id = $1', [clienteId])
    await sql('delete from public.clientes where id = $1', [clienteId])
  }
  if (activo) await borrarUsuario(activo.id)
  if (inactivo) await borrarUsuario(inactivo.id)
})

async function cotizacion(opciones: {
  hace?: number; validez?: number; aprobada?: boolean; actualizacion?: number; finalizada?: boolean; importada?: boolean
} = {}) {
  const [fila] = await sql<{ id: string; numero: string }>(
    `insert into public.cotizaciones
       (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, fecha_aprobacion, presupuesto_estado,
        fecha_proxima_actualizacion, origen, archivo_original_path)
     values ($1, 'jornada', $2, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, numero::text`,
    [clienteId, marca, sumarDias(hoy, -(opciones.hace ?? 0)), opciones.validez ?? 30,
      opciones.aprobada ? 'aprobada' : 'enviada', opciones.aprobada ? hoy : null,
      opciones.aprobada ? opciones.finalizada ? 'finalizado' : 'en_curso' : null,
      opciones.actualizacion === undefined ? null : sumarDias(hoy, opciones.actualizacion),
      opciones.importada ? 'importada' : 'app', opciones.importada ? `${marca}/original.pdf` : null],
  )
  return fila
}

async function envio(id: string, hace: number) {
  await sql(
    `insert into public.cotizacion_envios (cotizacion_id, pdf_path, enviada_at)
     values ($1, $2, ($3::date + time '12:00') at time zone 'America/Argentina/Buenos_Aires')`,
    [id, `${marca}/envio.pdf`, sumarDias(hoy, -hace)],
  )
}

async function documento(tipo: 'factura' | 'orden_compra' | 'orden_pago' | 'remito', presupuestos: string[], numero: string = tipo, monto = 1000) {
  const [fila] = await sql<{ id: string }>(
    `insert into public.documentos (cliente_id, tipo, numero, notas, monto, tipo_comprobante, fecha)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [clienteId, tipo, numero, marca, ['factura', 'orden_pago'].includes(tipo) ? monto : null, tipo === 'factura' ? 'FA' : null, sumarDias(hoy, -45)],
  )
  for (const id of presupuestos) await sql('insert into public.documento_presupuestos values ($1, $2)', [fila.id, id])
  return fila.id
}

async function pendientesPropios(cola: string) {
  const { data, error } = await activo.client.from('v_inicio_colas').select('*').eq('cliente_id', clienteId).eq('cola', cola)
  if (error) throw error
  return data
}

describe('Inicio: límites, unicidad y seguridad', () => {
  it('usa el último envío argentino, >5 días, vencimiento inclusivo a 7 y fallback de importadas', async () => {
    const cinco = await cotizacion({ hace: 10 })
    await envio(cinco.id, 10)
    await envio(cinco.id, 5)
    const seis = await cotizacion({ hace: 10 })
    await envio(seis.id, 6)
    const siete = await cotizacion({ hace: 23 })
    await envio(siete.id, 1)
    const ocho = await cotizacion({ hace: 22 })
    await envio(ocho.id, 1)
    const vencida = await cotizacion({ hace: 31 })
    await envio(vencida.id, 1)
    const importada = await cotizacion({ hace: 6, importada: true })
    const [{ id: contacto }] = await sql<{ id: string }>(
      `insert into public.contactos (cliente_id, nombre, telefono) values ($1, 'Persona elegida', '299 999-4455') returning id`, [clienteId],
    )
    await sql('update public.cotizaciones set contacto_id = $1 where id = $2', [contacto, seis.id])
    const filas = await pendientesPropios('seguimiento')
    expect(filas.map((f) => f.id).sort()).toEqual([seis.id, siete.id, vencida.id, importada.id].sort())
    expect(filas.find((f) => f.id === seis.id)).toMatchObject({ telefono: '299 999-4455', email: 'cliente@inicio.test', dias: 6 })
  })

  it('falta OC ignora anuladas y finalizados; actualización incluye vencidas y exactamente 30 días', async () => {
    const sinOc = await cotizacion({ aprobada: true, actualizacion: 30 })
    const conOc = await cotizacion({ aprobada: true, actualizacion: 31 })
    const vencida = await cotizacion({ aprobada: true, actualizacion: -1 })
    const finalizada = await cotizacion({ aprobada: true, actualizacion: -1, finalizada: true })
    const anulada = await documento('orden_compra', [sinOc.id])
    await sql('update public.documentos set deleted_at = now() where id = $1', [anulada])
    await documento('orden_compra', [conOc.id])
    expect((await pendientesPropios('falta_oc')).map((f) => f.id).sort()).toEqual([sinOc.id, vencida.id].sort())
    const actualizaciones = (await pendientesPropios('actualizacion')).map((f) => f.id)
    expect(actualizaciones.sort()).toEqual([sinOc.id, vencida.id].sort())
    expect(actualizaciones).not.toContain(finalizada.id)
  })

  it('cuenta remitos únicos y vuelve a incluirlos cuando su factura está anulada', async () => {
    const uno = await cotizacion({ aprobada: true })
    const dos = await cotizacion({ aprobada: true })
    const remito = await documento('remito', [uno.id, dos.id])
    const factura = await documento('factura', [uno.id, dos.id])
    expect((await pendientesPropios('para_facturar')).filter((f) => f.id === remito)).toHaveLength(1)
    await sql('update public.documentos set factura_id = $1 where id = $2', [factura, remito])
    expect((await pendientesPropios('para_facturar')).find((f) => f.id === remito)).toBeUndefined()
    await sql('update public.documentos set deleted_at = now() where id = $1', [factura])
    expect((await pendientesPropios('para_facturar')).filter((f) => f.id === remito)).toHaveLength(1)
  })

  it('el total global suma el saldo de cada factura compartida una vez y descuenta pagos', async () => {
    const antes = await activo.client.rpc('inicio_resumen')
    expect(antes.error).toBeNull()
    const uno = await cotizacion({ aprobada: true })
    const dos = await cotizacion({ aprobada: true })
    const factura = await documento('factura', [uno.id, dos.id], 'F-COMPARTIDA', 1200)
    const pago = await documento('orden_pago', [uno.id, dos.id], 'OP-COMPARTIDA', 200)
    await sql('insert into public.op_facturas values ($1, $2, 200)', [pago, factura])
    const despues = await activo.client.rpc('inicio_resumen')
    expect(despues.error).toBeNull()
    const previo = antes.data!.find((f) => f.cola === 'cobranzas')!
    const actual = despues.data!.find((f) => f.cola === 'cobranzas')!
    expect(actual.cantidad - previo.cantidad).toBe(1)
    expect(actual.importe - previo.importe).toBe(1000)
    expect((await pendientesPropios('cobranzas')).find((f) => f.id === factura)).toMatchObject({ importe: 1000, dias: 45 })
  })

  it('las acciones de remitos y cobros eligen un presupuesto no anulado o vuelven al documento', async () => {
    const finalizado = await cotizacion({ aprobada: true, finalizada: true })
    const anulado = await cotizacion({ aprobada: true })
    await sql("update public.cotizaciones set presupuesto_estado='anulado' where id=$1", [anulado.id])
    const remito = await documento('remito', [finalizado.id, anulado.id], 'R-DESTINO')
    const factura = await documento('factura', [finalizado.id, anulado.id], 'F-DESTINO')
    expect((await pendientesPropios('para_facturar')).find((f) => f.id === remito)?.presupuesto_id).toBe(finalizado.id)
    expect((await pendientesPropios('cobranzas')).find((f) => f.id === factura)?.presupuesto_id).toBe(finalizado.id)
    await sql("update public.cotizaciones set presupuesto_estado='anulado' where id=$1", [finalizado.id])
    expect((await pendientesPropios('para_facturar')).find((f) => f.id === remito)?.presupuesto_id).toBeNull()
    expect((await pendientesPropios('cobranzas')).find((f) => f.id === factura)?.presupuesto_id).toBeNull()
  })

  it('pagina cada cola sin duplicar ni perder filas y limita el tamaño de respuesta', async () => {
    const primera = await activo.client.rpc('inicio_pendientes', { p_cola: 'seguimiento', p_limite: 1 })
    const segunda = await activo.client.rpc('inicio_pendientes', { p_cola: 'seguimiento', p_limite: 1, p_desde: 1 })
    expect(primera.error).toBeNull()
    expect(segunda.error).toBeNull()
    expect(primera.data).toHaveLength(1)
    expect(segunda.data).toHaveLength(1)
    expect(primera.data![0].id).not.toBe(segunda.data![0].id)
    const invalida = await activo.client.rpc('inicio_pendientes', { p_cola: 'inventada' })
    expect(invalida.error?.code).toBe('22023')
  })

  it('RLS oculta los datos al inactivo y anon no puede ejecutar las lecturas', async () => {
    const pendientes = await inactivo.client.rpc('inicio_pendientes')
    const resumen = await inactivo.client.rpc('inicio_resumen')
    expect(pendientes.error).toBeNull()
    expect(pendientes.data).toEqual([])
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
      expect(data?.map((f) => f.id)).toEqual([clienteId])
    }
  })

  it('encuentra cotización y los cuatro tipos documentales, con enlaces al registro', async () => {
    const presupuesto = await cotizacion({ aprobada: true })
    const quote = await activo.client.rpc('buscar_global', { texto: presupuesto.numero, p_grupo: 'cotizaciones' })
    expect(quote.error).toBeNull()
    expect(quote.data?.find((f) => f.id === presupuesto.id)?.href).toBe(`/cotizaciones/${presupuesto.id}`)
    for (const tipo of ['orden_compra', 'remito', 'factura', 'orden_pago'] as const) {
      const numero = `${tipo.replaceAll('_', '-')}-${marca}-001`
      const id = await documento(tipo, [presupuesto.id], numero)
      const { data, error } = await activo.client.rpc('buscar_global', { texto: numero.replaceAll('-', ''), p_grupo: tipo })
      expect(error).toBeNull()
      expect(data?.map((f) => f.href)).toEqual([`/documentos/${id}`])
    }
  })

  it('interpreta % y _ literalmente, valida 200 caracteres, no revela anulados y mantiene RLS', async () => {
    const presupuesto = await cotizacion({ aprobada: true })
    const literal = `${marca}%_literal`
    const id = await documento('remito', [presupuesto.id], literal)
    await documento('remito', [presupuesto.id], `${marca}XXXliteral`)
    const respuesta = await activo.client.rpc('buscar_global', { texto: literal })
    expect(respuesta.error).toBeNull()
    expect(respuesta.data?.map((f) => f.id)).toEqual([id])
    await sql('update public.documentos set deleted_at = now() where id = $1', [id])
    expect((await activo.client.rpc('buscar_global', { texto: literal })).data).toEqual([])
    expect((await activo.client.rpc('buscar_global', { texto: 'a'.repeat(201) })).error?.code).toBe('22023')
    expect((await activo.client.rpc('buscar_global', { texto: 'a'.repeat(200) })).error).toBeNull()
    expect((await activo.client.rpc('buscar_global', { texto: '' })).data).toEqual([])
    expect((await inactivo.client.rpc('buscar_global', { texto: marca })).data).toEqual([])
    expect((await anonClient().rpc('buscar_global', { texto: marca })).error).not.toBeNull()
  })

  it('limita a 50 resultados por grupo y pagina sin perder el total', async () => {
    const prefijo = `limite-${marca}`
    await sql(
      `insert into public.documentos (cliente_id, tipo, numero, notas)
       select $1, 'remito', $2 || '-' || n, $3 from generate_series(1, 55) n`,
      [clienteId, prefijo, marca],
    )
    const primera = await activo.client.rpc('buscar_global', { texto: prefijo, p_limite: 1000 })
    const segunda = await activo.client.rpc('buscar_global', { texto: prefijo, p_limite: 50, p_desde: 50 })
    expect(primera.error).toBeNull()
    expect(primera.data).toHaveLength(50)
    expect(primera.data![0].cantidad).toBe(55)
    expect(segunda.data).toHaveLength(5)
    expect(new Set([...primera.data!, ...segunda.data!].map((f) => f.id)).size).toBe(55)
  })
})
