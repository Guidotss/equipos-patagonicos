import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { limpiarFilesSubidos, newBudget, uploadFile, uploadFileIn } from './documents-helpers'
import { removeUser, withConexion, contraTransaccionInCurso, crearUser, sql } from './helpers'
import { validateEnvTests } from '../../scripts/test-env.mjs'

validateEnvTests()

const MARCA = `historica-${crypto.randomUUID()}`
const clientId = crypto.randomUUID()
const otroClientId = crypto.randomUUID()
let activo: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>
let operador: SupabaseClient
let deshabilitado: SupabaseClient
let budgetNormal: string
let nextInvoice = 100

const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, options)
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, options)

type Entry = Awaited<ReturnType<typeof entryNew>>
type Result = { factura_id: string; presupuesto_id: string; numero_presupuesto: number; ya_importada: boolean }

async function clientWithSession(user: Awaited<ReturnType<typeof crearUser>>) {
  const { data } = await user.client.auth.getSession()
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    ...options,
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  })
}

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  operador = await clientWithSession(activo)
  deshabilitado = await clientWithSession(inactivo)
  await sql('insert into public.clientes (id, razon_social) values ($1, $2), ($3, $4)',
    [clientId, `Cliente sintético ${MARCA}`, otroClientId, `Otro cliente sintético ${MARCA}`])
  budgetNormal = await newBudget(activo.client, clientId, MARCA)
})

afterAll(async () => {
  try {
    await sql('delete from public.op_facturas where op_id in (select id from public.documentos where cliente_id = $1)', [clientId])
    await sql('delete from public.facturas_historicas where lote = $1', [MARCA])
    await sql('delete from public.documentos where cliente_id = $1', [clientId])
    await sql('delete from public.cotizaciones where cliente_id = $1', [clientId])
    await sql('delete from public.clientes where id = any($1::uuid[])', [[clientId, otroClientId]])
    await limpiarFilesSubidos()
  } finally {
    for (const user of [activo, inactivo]) if (user) await removeUser(user.id)
  }
})

async function entryNew() {
  const archivo = await uploadFile(activo.client, clientId, 'Factura sintética.pdf')
  return {
    cliente_id: clientId,
    emisor_cuit: '30712345678',
    numero: `00002-${String(nextInvoice++).padStart(8, '0')}`,
    fecha: '2024-06-20',
    fecha_vencimiento: '2024-07-20',
    neto: 1000,
    iva: 210,
    otros_tributos: 12.5,
    monto: 1222.5,
    periodo_desde: '2024-06-01',
    periodo_hasta: '2024-06-15',
    items: [{ descripcion: 'Servicio histórico sintético', cantidad: 2, precio_unitario: 500, unidad: 'HORA' }],
    archivo,
    sha256: 'a'.repeat(64),
    lote: MARCA,
    confirmacion_cobro: 'El usuario confirmó que el total fue cobrado',
    notas: 'Observación de origen sintética',
    fuente: { comprobante: 'FA', moneda: 'ARS', evidencia: { texto: 'Datos sintéticos de prueba' } },
  }
}

function importar(entrada: Record<string, unknown>, cliente = service) {
  return cliente.rpc('importar_factura_historica', { p_datos: entrada })
}

async function importOk(entrada?: Entry): Promise<Result> {
  const { data, error } = await importar(entrada ?? await entryNew())
  if (error) throw new Error(`Falló la importación: ${error.message}`)
  return data as Result
}

async function documentNormal(tipo: 'factura' | 'orden_pago', extra: Record<string, unknown> = {}, aplicaciones: { factura_id: string; monto_aplicado: number }[] = []) {
  const archivo = await uploadFile(activo.client, clientId)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: clientId, tipo, numero: `normal-${crypto.randomUUID()}`, monto: 1222.5,
      ...(tipo === 'factura' ? { tipo_comprobante: 'FA' } : {}), notas: MARCA, ...extra },
    p_presupuestos: [budgetNormal],
    p_archivos: [archivo],
    p_aplicaciones: aplicaciones,
  })
}

async function saldos(invoiceId: string) {
  return (await sql('select monto, cobrado, saldo, estado_cobro from public.v_facturas where id = $1', [invoiceId]))[0]
}

async function contraImportacionInCurso<T>(entrada: Entry, llamada: () => PromiseLike<T>): Promise<T> {
  return withConexion(async (conexion) => {
    await conexion.query('begin')
    await conexion.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: 'service_role' })])
    await conexion.query('set local role service_role')
    await conexion.query('select public.importar_factura_historica($1::jsonb)', [JSON.stringify(entrada)])
    const [{ pid }] = (await conexion.query<{ pid: number }>('select pg_backend_pid() as pid')).rows
    let terminada = false
    const pending = Promise.resolve(llamada())
    pending.then(() => { terminada = true }, () => { terminada = true })
    for (let intento = 0; intento < 100; intento++) {
      const [{ bloqueada }] = await sql<{ bloqueada: boolean }>(
        'select exists (select 1 from pg_stat_activity where $1 = any(pg_blocking_pids(pid))) as bloqueada', [pid])
      if (bloqueada) {
        await conexion.query('commit')
        return pending
      }
      if (terminada) throw new Error('El registro normal terminó sin esperar a la importación histórica en curso')
      await new Promise((resolver) => setTimeout(resolver, 50))
    }
    throw new Error('El registro normal no quedó esperando a la importación histórica')
  })
}

describe('importación histórica con evidencia y cobro confirmado', () => {
  it('crea presupuesto finalizado, ítems, factura original y PDF, sin inventar pagos ni documentos', async () => {
    const entrada = await entryNew()
    const result = await importOk(entrada)
    expect(result.ya_importada).toBe(false)
    expect(result.numero_presupuesto).toBeGreaterThan(0)
    const [invoice] = await sql('select cliente_id, tipo, numero, fecha::text, fecha_vencimiento::text, tipo_comprobante, monto, notas, created_by from public.documentos where id = $1', [result.factura_id])
    expect(invoice).toMatchObject({ cliente_id: clientId, tipo: 'factura', numero: entrada.numero,
      fecha: entrada.fecha, fecha_vencimiento: entrada.fecha_vencimiento, tipo_comprobante: 'FA', monto: '1222.50', created_by: null })
    expect(invoice.notas).toContain(entrada.notas)
    expect(invoice.notas).toContain(entrada.confirmacion_cobro)
    expect(invoice.notas).toContain('no acreditan la aprobación original')
    expect(invoice.notas).toContain('Sin OP ni fecha de pago acreditadas')
    const [budget] = await sql('select numero, origen, fecha::text, fecha_aprobacion::text, estado, presupuesto_estado, datos, equipo_id, contacto_id from public.cotizaciones where id = $1', [result.presupuesto_id])
    expect(budget).toEqual({ numero: String(result.numero_presupuesto), origen: 'directa', fecha: entrada.fecha,
      fecha_aprobacion: entrada.fecha, estado: 'aprobada', presupuesto_estado: 'finalizado',
      datos: { periodo_desde: entrada.periodo_desde, periodo_hasta: entrada.periodo_hasta }, equipo_id: null, contacto_id: null })
    expect(await sql('select descripcion, cantidad, precio_unitario, total, unidad from public.cotizacion_items where cotizacion_id = $1', [result.presupuesto_id]))
      .toEqual([{ descripcion: entrada.items[0].descripcion, cantidad: '2.00', precio_unitario: '500.00', total: '1000.00', unidad: 'HORA' }])
    expect(await sql('select cotizacion_id from public.documento_presupuestos where documento_id = $1', [result.factura_id]))
      .toEqual([{ cotizacion_id: result.presupuesto_id }])
    expect(await sql('select path, mime, nombre_original from public.documento_archivos where documento_id = $1', [result.factura_id]))
      .toEqual([{ ...entrada.archivo, mime: 'application/pdf' }])
    const [registro] = await sql('select clave_origen, sha256, lote, cobrado, confirmacion_cobro, entrada, registrado_at from public.facturas_historicas where factura_id = $1', [result.factura_id])
    expect(registro).toMatchObject({ clave_origen: `${entrada.emisor_cuit}:FA:${entrada.numero}`, sha256: entrada.sha256,
      lote: MARCA, cobrado: '1222.50', confirmacion_cobro: entrada.confirmacion_cobro, entrada })
    expect(registro.registrado_at).toBeInstanceOf(Date)
    expect(await saldos(result.factura_id)).toEqual({ monto: '1222.50', cobrado: '1222.50', saldo: '0.00', estado_cobro: 'cobrada' })
    expect(await sql('select facturado, saldo, facturas, ordenes_pago, remitos, ordenes_compra from public.v_presupuestos where id = $1', [result.presupuesto_id]))
      .toEqual([{ facturado: '1222.50', saldo: '0.00', facturas: '1', ordenes_pago: '0', remitos: '0', ordenes_compra: '0' }])
    expect(await sql('select * from public.op_facturas where factura_id = $1', [result.factura_id])).toEqual([])
  })

  it('solo service_role importa y los usuarios activos pueden leer el registro', async () => {
    const entrada = await entryNew()
    for (const cliente of [anonymous, operador, deshabilitado]) {
      expect((await importar(entrada, cliente)).error?.code).toBe('42501')
    }
    // También se exige el claim dentro de la función, aunque el dueño SQL tenga EXECUTE.
    await expect(sql('select public.importar_factura_historica($1::jsonb)', [JSON.stringify(entrada)]))
      .rejects.toMatchObject({ code: '42501' })
    const { factura_id } = await importOk(entrada)
    expect((await operador.from('facturas_historicas').select('factura_id').eq('factura_id', factura_id)).data).toEqual([{ factura_id }])
    expect((await operador.from('v_facturas').select('cobrado, saldo, estado_cobro').eq('id', factura_id)).data)
      .toEqual([{ cobrado: 1222.5, saldo: 0, estado_cobro: 'cobrada' }])
    expect((await deshabilitado.from('facturas_historicas').select('factura_id').eq('factura_id', factura_id)).data).toEqual([])
    expect((await anonymous.from('facturas_historicas').select('*')).error?.code).toBe('42501')
    for (const cliente of [anonymous, operador]) {
      expect((await cliente.from('facturas_historicas').update({ cobrado: 1 }).eq('factura_id', factura_id)).error?.code).toBe('42501')
      expect((await cliente.from('facturas_historicas').delete().eq('factura_id', factura_id)).error?.code).toBe('42501')
      expect((await cliente.from('facturas_historicas').insert({ factura_id })).error?.code).toBe('42501')
      expect((await cliente.from('documentos').update({ monto: 1 }).eq('id', factura_id)).error?.code).toBe('42501')
    }
  })

  it('reintentos iguales y dos importaciones simultáneas devuelven los mismos IDs', async () => {
    const entrada = await entryNew()
    const respuestas = await Promise.all([importar(entrada), importar(entrada)])
    expect(respuestas.map((r) => r.error)).toEqual([null, null])
    const results = respuestas.map((r) => r.data as Result)
    expect(results.map((r) => r.ya_importada).sort()).toEqual([false, true])
    expect(results[0].factura_id).toBe(results[1].factura_id)
    expect(results[0].presupuesto_id).toBe(results[1].presupuesto_id)
    expect(await importOk(entrada)).toEqual({ ...results[0], ya_importada: true })
    expect(await sql('select count(*) from public.documentos where numero = $1 and tipo = $2', [entrada.numero, 'factura'])).toEqual([{ count: '1' }])
  })

  it('rechaza reintentos con distinta evidencia, notas, archivo, SHA o importes sin reemplazar nada', async () => {
    const entrada = await entryNew()
    const result = await importOk(entrada)
    for (const change of [
      { fuente: { ...entrada.fuente, revisada: true } }, { notas: 'otra observación' }, { sha256: 'b'.repeat(64) },
      { archivo: { ...entrada.archivo, nombre_original: 'Otro nombre.pdf' } }, { monto: 1500 },
    ]) {
      expect((await importar({ ...entrada, ...change })).error?.message).toMatch(/otra entrada o evidencia/)
    }
    expect(await importOk(entrada)).toEqual({ ...result, ya_importada: true })
  })

  it('rechaza números ya registrados por el circuito habitual, incluso anulados', async () => {
    for (const anular of [false, true]) {
      const entrada = await entryNew()
      const normal = await documentNormal('factura', { numero: entrada.numero })
      expect(normal.error).toBeNull()
      if (anular) expect((await activo.client.rpc('anular_documento', { p_id: normal.data! })).error).toBeNull()
      expect((await importar(entrada)).error?.message).toMatch(/ya existe una factura FA/)
    }
  })

  it('no recrea una factura anulada ni un presupuesto cuyo estado cambió', async () => {
    const entrada = await entryNew()
    const result = await importOk(entrada)
    expect((await activo.client.rpc('anular_documento', { p_id: result.factura_id })).error).toBeNull()
    expect((await importar(entrada)).error?.message).toMatch(/alterados o anulados/)
    expect((await activo.client.rpc('restaurar_documento', { p_id: result.factura_id })).error).toBeNull()
    expect((await activo.client.rpc('cambiar_estado_presupuesto', { p_id: result.presupuesto_id, p_estado: 'en_curso' })).error).toBeNull()
    expect((await importar(entrada)).error?.message).toMatch(/alterados o anulados/)
    expect(await sql('select count(*) from public.facturas_historicas where entrada->>\'numero\' = $1', [entrada.numero])).toEqual([{ count: '1' }])
  })

  it('protege datos financieros originales, permite notas, anulación y restauración', async () => {
    const entrada = await entryNew()
    const result = await importOk(entrada)
    const originales = { tipo: 'factura', numero: entrada.numero, fecha: entrada.fecha, monto: entrada.monto,
      tipo_comprobante: 'FA', fecha_vencimiento: entrada.fecha_vencimiento, notas: 'Nota posterior' }
    for (const change of [
      { monto: 1500 }, { numero: '00002-99999999' }, { fecha: '2024-06-21' },
      { fecha_vencimiento: '2024-07-21' }, { tipo_comprobante: 'FB' }, { tipo: 'orden_pago' },
    ]) {
      expect((await activo.client.rpc('actualizar_documento', { p_id: result.factura_id, p_datos: { ...originales, ...change } })).error?.message)
        .toMatch(/factura histórica están protegidos/)
    }
    await expect(sql('update public.documentos set cliente_id = $1 where id = $2', [otroClientId, result.factura_id]))
      .rejects.toMatchObject({ message: expect.stringMatching(/factura histórica están protegidos/) })
    expect((await activo.client.rpc('actualizar_documento', { p_id: result.factura_id, p_datos: originales })).error).toBeNull()
    expect((await activo.client.rpc('anular_documento', { p_id: result.factura_id })).error).toBeNull()
    expect((await activo.client.rpc('restaurar_documento', { p_id: result.factura_id })).error).toBeNull()
    expect((await saldos(result.factura_id)).saldo).toBe('0.00')
  })

  it('no permite aplicar una OP ni restaurarla contra el cobro histórico', async () => {
    const result = await importOk()
    expect((await documentNormal('orden_pago', {}, [{ factura_id: result.factura_id, monto_aplicado: 1 }])).error?.message)
      .toMatch(/supera el saldo/)
    const op = await documentNormal('orden_pago')
    expect(op.error).toBeNull()
    expect((await activo.client.rpc('anular_documento', { p_id: op.data! })).error).toBeNull()
    // Estado legado que no puede armar una RPC actual: aplicación guardada en una OP anulada.
    await sql('insert into public.op_facturas (op_id, factura_id, monto_aplicado) values ($1, $2, 1)', [op.data, result.factura_id])
    expect((await activo.client.rpc('restaurar_documento', { p_id: op.data! })).error?.message).toMatch(/ya no tiene saldo/)
    expect((await saldos(result.factura_id)).saldo).toBe('0.00')
    expect((await activo.client.rpc('anular_documento', { p_id: result.factura_id })).error).toBeNull()
    await sql('update public.documentos set deleted_at = null, deleted_by = null where id = $1', [op.data])
    expect((await activo.client.rpc('restaurar_documento', { p_id: result.factura_id })).error?.message)
      .toMatch(/cobro histórico y las órdenes de pago superan/)
  })

  it('mantiene el cobro por OP y las ediciones en facturas normales', async () => {
    const invoice = await documentNormal('factura')
    expect(invoice.error).toBeNull()
    expect((await saldos(invoice.data!)).saldo).toBe('1222.50')
    const op = await documentNormal('orden_pago', { monto: 222.5 }, [{ factura_id: invoice.data!, monto_aplicado: 222.5 }])
    expect(op.error).toBeNull()
    expect(await saldos(invoice.data!)).toEqual({ monto: '1222.50', cobrado: '222.50', saldo: '1000.00', estado_cobro: 'parcial' })
    expect((await activo.client.rpc('actualizar_documento', { p_id: invoice.data!,
      p_datos: { tipo: 'factura', numero: 'edición normal', monto: 1500, tipo_comprobante: 'FA', notas: MARCA } })).error).toBeNull()
    expect((await saldos(invoice.data!)).saldo).toBe('1277.50')
    expect((await activo.client.rpc('anular_documento', { p_id: op.data! })).error).toBeNull()
    expect((await saldos(invoice.data!)).saldo).toBe('1500.00')
  })
})

describe('duplicados entre importación y registro habitual', () => {
  it.each([false, true])('el registro habitual no duplica una histórica (anulada: %s)', async (anulada) => {
    const entrada = await entryNew()
    const { factura_id } = await importOk(entrada)
    if (anulada) expect((await activo.client.rpc('anular_documento', { p_id: factura_id })).error).toBeNull()
    const duplicada = await documentNormal('factura', { numero: entrada.numero.replace('-', '/') })
    expect(duplicada.error?.message).toMatch(/Ya existe una factura histórica FA/)
  })

  it('tampoco permite editar una factura habitual para duplicar el número de una histórica', async () => {
    const entrada = await entryNew()
    await importOk(entrada)
    const normal = await documentNormal('factura')
    expect(normal.error).toBeNull()
    expect((await activo.client.rpc('actualizar_documento', { p_id: normal.data!,
      p_datos: { tipo: 'factura', tipo_comprobante: 'FA', monto: 1222.5, numero: entrada.numero, notas: MARCA },
    })).error?.message).toMatch(/Ya existe una factura histórica FA/)
  })

  it('la importación espera al registro normal y luego rechaza el número que este guardó', async () => {
    const entrada = await entryNew()
    const archivo = await uploadFile(activo.client, clientId)
    const imported = await contraTransaccionInCurso(activo.id,
      'select public.registrar_documento($1::jsonb, $2::uuid[], $3::jsonb)',
      [JSON.stringify({ cliente_id: clientId, tipo: 'factura', tipo_comprobante: 'FA', monto: 1222.5,
        numero: entrada.numero.replace('-', '/'), notas: MARCA }), [budgetNormal], JSON.stringify([archivo])],
      () => importar(entrada))
    expect(imported.error?.message).toMatch(/ya existe una factura FA/)
    expect(await sql('select count(*) from public.documentos where numero_normalizado = $1',
      [entrada.numero.replace('-', '').replace(/^0+/, '')])).toEqual([{ count: '1' }])
  })

  it('el registro normal espera a la importación y luego rechaza la histórica que esta guardó', async () => {
    const entrada = await entryNew()
    const normal = await contraImportacionInCurso(entrada,
      () => documentNormal('factura', { numero: entrada.numero.replace('-', '/') }))
    expect(normal.error?.message).toMatch(/Ya existe una factura histórica FA/)
    expect(await sql('select count(*) from public.documentos where numero_normalizado = $1',
      [entrada.numero.replace('-', '').replace(/^0+/, '')])).toEqual([{ count: '1' }])
  })

  it('conserva el comportamiento de dos facturas habituales con el mismo número', async () => {
    const numero = `compartido-${crypto.randomUUID()}`
    expect((await documentNormal('factura', { numero })).error).toBeNull()
    expect((await documentNormal('factura', { numero })).error).toBeNull()
  })
})

describe('validación y atomicidad de la importación', () => {
  it.each<[string, Record<string, unknown>, RegExp]>([
    ['monto con más de dos decimales', { monto: 1222.501 }, /Importe inválido/],
    ['neto que no coincide con los ítems', { neto: 999, monto: 1221.5 }, /suma de los ítems/],
    ['total que no coincide con impuestos', { monto: 1223 }, /no coinciden con el monto/],
    ['importe negativo', { iva: -1 }, /Importe inválido/],
    ['importe fuera de escala', { monto: '1000000000000.00' }, /Importe inválido/],
    ['fecha inexistente', { fecha: '2024-02-30' }, /Fecha inválida/],
    ['fecha ausente', { fecha: null }, /Fecha inválida/],
    ['período invertido', { periodo_hasta: '2024-05-01' }, /período termina/],
    ['cliente inexistente', { cliente_id: crypto.randomUUID() }, /cliente no existe/],
    ['SHA inválido', { sha256: 'abc' }, /SHA-256/],
    ['confirmación ausente', { confirmacion_cobro: '' }, /confirmación de cobro/],
    ['evidencia ausente', { fuente: null }, /evidencia/],
    ['lista vacía', { items: [] }, /entre 1 y 200 ítems/],
    ['cantidad redondeable', { items: [{ descripcion: 'Servicio', cantidad: 2.001, precio_unitario: 500, unidad: 'HORA' }] }, /Ítem inválido/],
    ['precio cero', { items: [{ descripcion: 'Servicio', cantidad: 2, precio_unitario: 0, unidad: 'HORA' }] }, /deben ser positivos/],
    ['número incompleto', { numero: '2-100' }, /número completo/],
  ])('rechaza %s antes de crear documentos', async (_name, change, message) => {
    const entrada = await entryNew()
    expect((await importar({ ...entrada, ...change })).error?.message).toMatch(message)
    expect(await sql('select * from public.documentos where numero = $1', [entrada.numero])).toEqual([])
  })

  it('revierte factura, presupuesto, ítems y registro si falla el PDF al final', async () => {
    const entrada = await entryNew()
    const contar = () => sql(`select
      (select count(*) from public.documentos where cliente_id = $1) as documentos,
      (select count(*) from public.cotizaciones where cliente_id = $1) as presupuestos,
      (select count(*) from public.cotizacion_items i join public.cotizaciones c on c.id = i.cotizacion_id where c.cliente_id = $1) as items,
      (select count(*) from public.facturas_historicas where lote = $2) as registros`, [clientId, MARCA])
    const antes = await contar()
    const withoutFile = { path: `documentos/${clientId}/${crypto.randomUUID()}.pdf`, nombre_original: 'No existe.pdf' }
    expect((await importar({ ...entrada, archivo: withoutFile })).error?.message).toMatch(/No se encontró el archivo/)
    expect(await contar()).toEqual(antes)
    const folderAjena = await uploadFile(activo.client, otroClientId)
    expect((await importar({ ...entrada, archivo: folderAjena })).error?.message).toMatch(/carpeta del cliente/)
    expect(await contar()).toEqual(antes)
    const path = `documentos/${clientId}/${crypto.randomUUID()}.pdf`
    const noPdf = await uploadFileIn(activo.client, path, 'Imagen.pdf')
    await sql("update storage.objects set metadata = jsonb_set(metadata, '{mimetype}', '\"image/png\"') where bucket_id = 'documentos' and name = $1", [path])
    expect((await importar({ ...entrada, archivo: noPdf })).error?.message).toMatch(/PDF válido/)
    expect(await contar()).toEqual(antes)
  })
})
