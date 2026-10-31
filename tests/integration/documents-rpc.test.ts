// tests/integration/documentos-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/lib/supabase/database.types'
import { idsOfExample } from './quotes-helpers'
import { limpiarFilesSubidos, limpiarDocuments, newBudget, uploadFile, uploadFileIn } from './documents-helpers'
import { removeUser, contraTransaccionInCurso, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let inactivo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
let budget: string

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  inactivo = await crearUser({ activo: false })
  ids = await idsOfExample()
  budget = await newBudget(activo.client, ids.cliente_id, MARCA)
})

afterAll(async () => {
  try {
    await limpiarDocuments(MARCA)
    await limpiarFilesSubidos()
  } finally {
    for (const u of [activo, inactivo]) await removeUser(u.id)
  }
})

async function register(
  datos: Record<string, unknown>,
  extra: { budgets?: string[]; remitos?: string[]; aplicaciones?: Json[] } = {},
) {
  const archivo = await uploadFile(activo.client, ids.cliente_id)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: ids.cliente_id, notas: MARCA, ...datos },
    p_presupuestos: extra.budgets ?? [budget],
    p_archivos: [archivo],
    p_remitos: extra.remitos ?? [],
    p_aplicaciones: extra.aplicaciones ?? [],
  })
}

/** Como `registrar`, para preparar datos: si falla tira un error que dice qué pasó, y si no devuelve el id. */
async function registerOk(datos: Record<string, unknown>, extra: Parameters<typeof register>[1] = {}): Promise<string> {
  const { data, error } = await register(datos, extra)
  if (error) throw new Error(`No se pudo registrar el documento (${String(datos.tipo)}): ` + error.message)
  return data
}

/** Corre `llamada` mientras otra transacción tiene a medio registrar un documento. */
async function contraRegistroInCurso<T>(
  datos: Record<string, unknown>,
  extra: { remitos?: string[]; aplicaciones?: Json[] },
  llamada: () => PromiseLike<T>,
): Promise<T> {
  const archivo = await uploadFile(activo.client, ids.cliente_id)
  return contraTransaccionInCurso(
    activo.id,
    'select public.registrar_documento($1::jsonb, $2::uuid[], $3::jsonb, $4::uuid[], $5::jsonb)',
    [
      JSON.stringify({ cliente_id: ids.cliente_id, notas: MARCA, ...datos }),
      [budget],
      JSON.stringify([archivo]),
      extra.remitos ?? [],
      JSON.stringify(extra.aplicaciones ?? []),
    ],
    llamada,
  )
}

/** Registra un documento con dos archivos y devuelve los ids de los archivos en orden. */
async function documentWithDosFiles() {
  const id = await registerOk({ tipo: 'remito' })
  const pagina = await uploadFile(activo.client, ids.cliente_id, 'Página 2.jpg')
  const { error } = await activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [pagina] })
  if (error) throw new Error('No se pudo agregar la segunda página: ' + error.message)
  const archivos = await sql<{ id: string }>(
    'select id from public.documento_archivos where documento_id = $1 order by orden',
    [id],
  )
  return { id, archivos: archivos.map((a) => a.id) }
}

describe('registrar_documento', () => {
  it('registra una OC con su archivo; tamaño y tipo salen de Storage', async () => {
    const { data: id, error } = await register({ tipo: 'orden_compra', numero: 'OC-4500012345' })
    expect(error).toBeNull()

    const [archivo] = await sql<{ mime: string; tamano: string; nombre_original: string; orden: number }>(
      'select mime, tamano, nombre_original, orden from public.documento_archivos where documento_id = $1',
      [id],
    )
    expect(archivo).toEqual({
      mime: 'application/pdf',
      tamano: String('%PDF-1.4 prueba'.length),
      nombre_original: 'Remito Neuquén N° 1.pdf',
      orden: 1,
    })
    const vinculos = await sql('select cotizacion_id from public.documento_presupuestos where documento_id = $1', [id])
    expect(vinculos).toEqual([{ cotizacion_id: budget }])
  })

  it('exige presupuesto, archivo y que el archivo exista en Storage', async () => {
    expect((await register({ tipo: 'remito' }, { budgets: [] })).error?.message).toMatch(/al menos un presupuesto/)

    const withoutFile = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [budget],
      p_archivos: [],
    })
    expect(withoutFile.error?.message).toMatch(/al menos un archivo/)

    const missing = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [budget],
      p_archivos: [{ path: `documentos/${ids.cliente_id}/${crypto.randomUUID()}.pdf`, nombre_original: 'x.pdf' }],
    })
    expect(missing.error?.message).toMatch(/No se encontró el archivo/)
  })

  it('el archivo tiene que tener nombre y no estar vacío', async () => {
    const registerWith = (archivo: { path: string; nombre_original: string }) =>
      activo.client.rpc('registrar_documento', {
        p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
        p_presupuestos: [budget],
        p_archivos: [archivo],
      })

    const withoutName = await registerWith({ ...(await uploadFile(activo.client, ids.cliente_id)), nombre_original: '  ' })
    expect({ code: withoutName.error?.code, message: withoutName.error?.message }).toEqual({
      code: 'P0001',
      message: 'Falta el nombre del archivo',
    })

    const empty = await uploadFileIn(activo.client, `documentos/${ids.cliente_id}/${crypto.randomUUID()}.pdf`, 'Vacío.pdf', '')
    const withFileEmpty = await registerWith(empty)
    expect({ code: withFileEmpty.error?.code, message: withFileEmpty.error?.message }).toEqual({
      code: 'P0001',
      message: 'El archivo está vacío',
    })
  })

  it('un mismo archivo no se vincula a dos documentos', async () => {
    const archivo = await uploadFile(activo.client, ids.cliente_id)
    const llamada = () =>
      activo.client.rpc('registrar_documento', {
        p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
        p_presupuestos: [budget],
        p_archivos: [archivo],
      })
    expect((await llamada()).error).toBeNull()
    const { error } = await llamada()
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: 'P0001',
      message: 'Ese archivo ya está cargado en un documento',
    })
  })

  it('el mismo archivo dos veces en la lista se rechaza', async () => {
    const archivo = await uploadFile(activo.client, ids.cliente_id)
    const { error } = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [budget],
      p_archivos: [archivo, archivo],
    })
    expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: 'Un archivo aparece dos veces' })
  })

  it('no carga documentos en presupuestos de otro cliente ni en anulados', async () => {
    const otro = await newBudget(activo.client, ids.client_with_contact_id, MARCA)
    expect((await register({ tipo: 'remito' }, { budgets: [otro] })).error?.message).toMatch(/mismo cliente/)

    const voided = await newBudget(activo.client, ids.cliente_id, MARCA)
    await sql(`update public.cotizaciones set presupuesto_estado = 'anulado' where id = $1`, [voided])
    expect((await register({ tipo: 'remito' }, { budgets: [voided] })).error?.message).toMatch(/no anulados/)
  })

  it('una factura cubre remitos y una OP cancela facturas con monto aplicado', async () => {
    const deliveryNote = await registerOk({ tipo: 'remito', numero: 'R-1' })
    const { data: invoice, error } = await register(
      { tipo: 'factura', numero: '0001-00000123', monto: 1000, tipo_comprobante: 'FA' },
      { remitos: [deliveryNote] },
    )
    expect(error).toBeNull()
    expect((await sql('select factura_id from public.documentos where id = $1', [deliveryNote]))[0]).toEqual({ factura_id: invoice })

    const { error: errorOp } = await register(
      { tipo: 'orden_pago', numero: 'OP-77', monto: 1000 },
      { aplicaciones: [{ factura_id: invoice, monto_aplicado: 1000 }] },
    )
    expect(errorOp).toBeNull()
    const [vf] = await sql<{ saldo: string }>('select saldo from public.v_facturas where id = $1', [invoice])
    expect(Number(vf.saldo)).toBe(0)
  })

  it('un remito cubierto por otra factura vigente no se le saca; el de una factura anulada, sí', async () => {
    const dataInvoice = { tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }
    const deliveryNote = await registerOk({ tipo: 'remito' })
    const invoiceA = await registerOk(dataInvoice, { remitos: [deliveryNote] })
    const invoiceOfDeliveryNote = async () => (await sql('select factura_id from public.documentos where id = $1', [deliveryNote]))[0]

    const reguardar = await activo.client.rpc('actualizar_documento', {
      p_id: invoiceA,
      p_datos: { ...dataInvoice, notas: MARCA },
      p_presupuestos: [budget],
      p_remitos: [deliveryNote],
    })
    expect(reguardar.error).toBeNull()

    expect((await register(dataInvoice, { remitos: [deliveryNote] })).error?.message).toMatch(/ya está cubierto por otra factura/)
    expect(await invoiceOfDeliveryNote()).toEqual({ factura_id: invoiceA })

    expect((await activo.client.rpc('anular_documento', { p_id: invoiceA })).error).toBeNull()
    const { data: invoiceB, error } = await register(dataInvoice, { remitos: [deliveryNote] })
    expect(error).toBeNull()
    expect(await invoiceOfDeliveryNote()).toEqual({ factura_id: invoiceB })
  })

  it('una OP no aplica más que el saldo de la factura ni más que su propio monto', async () => {
    const invoice = await registerOk({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' })
    expect(
      (await register({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: invoice, monto_aplicado: 600 }] })).error?.message,
    ).toMatch(/supera el saldo/)
    expect(
      (await register({ tipo: 'orden_pago', monto: 100 }, { aplicaciones: [{ factura_id: invoice, monto_aplicado: 200 }] })).error?.message,
    ).toMatch(/supera el monto de la orden de pago/)
  })

  describe('facturas canceladas por una orden de pago', () => {
    const DECIMALES = 'El monto aplicado tiene que ser un número positivo con hasta 2 decimales'
    const MAXIMO = 'El monto supera el máximo permitido'
    let invoice: string
    beforeAll(async () => {
      invoice = await registerOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    })
    const op = (aplicaciones: Json[]) => register({ tipo: 'orden_pago', monto: 100 }, { aplicaciones })
    const result = (error: { code?: string; message: string } | null) => ({ code: error?.code, message: error?.message })

    it.each<[string, Json, string]>([
      ['con más de 2 decimales (no se redondea)', 33.335, DECIMALES],
      ['que redondeado da cero', 0.001, DECIMALES],
      ['con letras', 'abc', DECIMALES],
      ['negativo', -5, DECIMALES],
      ['con más de 12 dígitos enteros', 1234567890123, MAXIMO],
      ['que falta', null, DECIMALES],
      ['cero', '0.00', 'El monto aplicado tiene que ser mayor a cero'],
    ])('rechaza un monto aplicado %s', async (_, monto, message) => {
      const { error } = await op([{ factura_id: invoice, monto_aplicado: monto }])
      expect(result(error)).toEqual({ code: 'P0001', message: message })
    })

    it('rechaza una aplicación sin factura o con una factura que no es un id', async () => {
      for (const aplicacion of [{ monto_aplicado: 10 }, { factura_id: 'abc', monto_aplicado: 10 }, 5]) {
        const { error } = await op([aplicacion])
        expect(result(error)).toEqual({ code: 'P0001', message: 'Falta la factura en una de las facturas canceladas' })
      }
    })

    it('la misma factura en minúsculas y en mayúsculas cuenta como repetida', async () => {
      const { error } = await op([
        { factura_id: invoice, monto_aplicado: 10 },
        { factura_id: invoice.toUpperCase(), monto_aplicado: 10 },
      ])
      expect(result(error)).toEqual({ code: 'P0001', message: 'Una factura aparece dos veces en la orden de pago' })
    })

    it('rechaza lo aplicado que supera la orden de pago aunque la suma pase de 12 dígitos enteros', async () => {
      const MAXIMO = 999999999999.99
      const facturas: string[] = []
      for (let i = 0; i < 2; i++) facturas.push(await registerOk({ tipo: 'factura', monto: MAXIMO, tipo_comprobante: 'FA' }))
      const { error } = await register(
        { tipo: 'orden_pago', monto: MAXIMO },
        { aplicaciones: facturas.map((factura_id) => ({ factura_id, monto_aplicado: 600000000000 })) },
      )
      expect(result(error)).toEqual({ code: 'P0001', message: 'Lo aplicado a facturas supera el monto de la orden de pago' })
    })

    it('guarda el monto aplicado tal cual, con hasta 2 decimales', async () => {
      const { data: id, error } = await op([{ factura_id: invoice, monto_aplicado: 33.33 }])
      expect(error).toBeNull()
      expect(await sql('select monto_aplicado from public.op_facturas where op_id = $1', [id])).toEqual([{ monto_aplicado: '33.33' }])
    })
  })

  it('remitos solo en facturas', async () => {
    const deliveryNote = await registerOk({ tipo: 'remito' })
    expect((await register({ tipo: 'orden_compra' }, { remitos: [deliveryNote] })).error?.message).toMatch(/Solo una factura cubre remitos/)
  })

  it('las facturas canceladas tienen que venir como lista', async () => {
    const archivo = await uploadFile(activo.client, ids.cliente_id)
    const { error } = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [budget],
      p_archivos: [archivo],
      p_aplicaciones: { factura_id: budget, monto_aplicado: 1 },
    })
    expect(error?.code).toBe('P0001')
    expect(error?.message).toMatch(/tienen que ser una lista/)
  })

  it('un usuario inactivo no registra', async () => {
    const { error } = await inactivo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito' },
      p_presupuestos: [budget],
      p_archivos: [],
    })
    expect(error?.code).toBe('42501')
  })
})

describe('ruta del archivo', () => {
  const MENSAJE = 'El archivo no corresponde a la carpeta del cliente'
  const registerWith = (archivo: { path: string; nombre_original: string }) =>
    activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [budget],
      p_archivos: [archivo],
    })

  it('un archivo subido en la carpeta de otro cliente no se registra ni se agrega', async () => {
    const foreign = await uploadFileIn(activo.client, `documentos/${ids.client_with_contact_id}/${crypto.randomUUID()}.pdf`)

    const registro = await registerWith(foreign)
    expect({ code: registro.error?.code, message: registro.error?.message }).toEqual({ code: 'P0001', message: MENSAJE })

    const id = await registerOk({ tipo: 'remito' })
    const agregado = await activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [foreign] })
    expect({ code: agregado.error?.code, message: agregado.error?.message }).toEqual({ code: 'P0001', message: MENSAJE })
    expect(await sql('select count(*)::int as archivos from public.documento_archivos where documento_id = $1', [id])).toEqual([
      { archivos: 1 },
    ])
  })

  it('una ruta con .. o con una carpeta de más se rechaza', async () => {
    const withFolderOfMas = await uploadFileIn(activo.client, `documentos/${ids.cliente_id}/extra/${crypto.randomUUID()}.pdf`)
    const withPuntos = {
      path: `documentos/${ids.cliente_id}/../${ids.client_with_contact_id}/${crypto.randomUUID()}.pdf`,
      nombre_original: 'x.pdf',
    }
    for (const archivo of [withFolderOfMas, withPuntos]) {
      const { error } = await registerWith(archivo)
      expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: MENSAJE })
    }
  })
})

describe('datos inválidos dan P0001 con el mensaje en castellano, nunca el error de un CHECK', () => {
  const MONTO = 'El monto tiene que ser un número positivo con hasta 2 decimales'
  const MAXIMO = 'El monto supera el máximo permitido'
  const NUMBER_LARGO = 'El número puede tener hasta 50 caracteres'
  const invoice = { tipo: 'factura', tipo_comprobante: 'FA' }
  // Más de lo que entra en una fila del índice documentos_numero_normalizado (2704 bytes): sin el control del
  // largo daba un error crudo (54000). Al azar, para que Postgres no lo comprima.
  const numberEnorme = Array.from({ length: 250 }, () => crypto.randomUUID()).join('')
  const casos: [string, Record<string, unknown>, string][] = [
    ['tipo desconocido', { tipo: 'presupuesto' }, 'Tipo de documento inválido'],
    ['monto con letras', { ...invoice, monto: 'abc' }, MONTO],
    ['monto negativo', { ...invoice, monto: -5 }, MONTO],
    ['monto cero', { tipo: 'orden_pago', monto: 0 }, MONTO],
    ['monto con 3 decimales', { ...invoice, monto: 10.005 }, MONTO],
    ['monto que redondeado da cero', { tipo: 'orden_pago', monto: 0.001 }, MONTO],
    ['monto que no es un número', { ...invoice, monto: { value: 10 } }, MONTO],
    ['monto con más de 12 dígitos enteros', { ...invoice, monto: 1234567890123 }, MAXIMO],
    ['monto enorme', { tipo: 'orden_pago', monto: 1e20 }, MAXIMO],
    ['factura sin monto', invoice, 'Indicá el monto de la factura'],
    ['orden de pago sin monto', { tipo: 'orden_pago' }, 'Indicá el monto de la orden de pago'],
    ['factura sin comprobante', { tipo: 'factura', monto: 100 }, 'Elegí un comprobante válido'],
    ['factura con comprobante desconocido', { tipo: 'factura', monto: 100, tipo_comprobante: 'FC' }, 'Elegí un comprobante válido'],
    ['período al revés', { tipo: 'remito', periodo_desde: '2026-10-10', periodo_hasta: '2026-10-01' }, 'El período termina antes de empezar'],
    ['cliente que no es un id', { tipo: 'remito', cliente_id: 'abc' }, 'Cliente inválido'],
    ['cliente vacío', { tipo: 'remito', cliente_id: '' }, 'Cliente inválido'],
    ['equipo que no es un id', { tipo: 'remito', equipo_id: 'grua-40' }, 'Equipo inválido'],
    ['equipo que no es un id en un documento que no es remito', { tipo: 'orden_compra', equipo_id: 'abc' }, 'Equipo inválido'],
    ['equipo que no existe', { tipo: 'remito', equipo_id: '00000000-0000-4000-8000-000000000000' }, 'El equipo no existe'],
    ['fecha con letras', { tipo: 'remito', fecha: 'abc' }, 'Fecha inválida'],
    ['fecha que no existe', { tipo: 'remito', fecha: '2026-02-30' }, 'Fecha inválida'],
    ['fecha en otro formato', { tipo: 'remito', fecha: '30/10/2026' }, 'Fecha inválida'],
    ['fecha que no es un texto', { tipo: 'remito', fecha: 20261030 }, 'Fecha inválida'],
    ['vencimiento con letras', { ...invoice, monto: 100, fecha_vencimiento: 'abc' }, 'Fecha inválida'],
    ['período con letras en un remito', { tipo: 'remito', periodo_hasta: 'abc' }, 'Fecha inválida'],
    ['período con letras en una factura', { ...invoice, monto: 100, periodo_desde: 'abc' }, 'Fecha inválida'],
    ['número de más de 50 caracteres', { tipo: 'remito', numero: 'N'.repeat(51) }, NUMBER_LARGO],
    ['número enorme', { tipo: 'remito', numero: numberEnorme }, NUMBER_LARGO],
    [
      'OC de referencia de más de 50 caracteres',
      { ...invoice, monto: 100, numero_oc_ref: 'O'.repeat(51) },
      'La OC de referencia puede tener hasta 50 caracteres',
    ],
    ['notas de más de 2000 caracteres', { tipo: 'remito', notas: 'x'.repeat(2001) }, 'Las notas pueden tener hasta 2000 caracteres'],
  ]
  const result = (error: { code?: string; message: string } | null) => ({ code: error?.code, message: error?.message })

  it.each([...casos, ['sin tipo', {}, 'Tipo de documento inválido'] as (typeof casos)[number]])(
    'registrar_documento: %s',
    async (_, datos, message) => {
      expect(result((await register(datos)).error)).toEqual({ code: 'P0001', message: message })
    },
  )

  it.each(casos)('actualizar_documento: %s', async (_, datos, message) => {
    const deliveryNote = await registerOk({ tipo: 'remito', numero: 'R-sin-vinculos' })
    const { error } = await activo.client.rpc('actualizar_documento', { p_id: deliveryNote, p_datos: { notas: MARCA, ...datos } })
    expect(result(error)).toEqual({ code: 'P0001', message: message })
    expect((await sql('select tipo, numero from public.documentos where id = $1', [deliveryNote]))[0]).toEqual({
      tipo: 'remito',
      numero: 'R-sin-vinculos',
    })
  })

  it.each<[string, Json]>([
    ['una lista', [{ tipo: 'remito' }]],
    ['un texto', 'remito'],
    // Al actualizar, un p_datos nulo dejaba el documento vacío sin dar error.
    ['nulo', null],
  ])('p_datos que no es un objeto (%s)', async (_, datos) => {
    const MENSAJE = { code: 'P0001', message: 'Los datos del documento tienen que ser un objeto' }
    const registrado = await activo.client.rpc('registrar_documento', {
      p_datos: datos,
      p_presupuestos: [budget],
      p_archivos: [await uploadFile(activo.client, ids.cliente_id)],
    })
    expect(result(registrado.error)).toEqual(MENSAJE)

    const deliveryNote = await registerOk({ tipo: 'remito' })
    const actualizado = await activo.client.rpc('actualizar_documento', { p_id: deliveryNote, p_datos: datos })
    expect(result(actualizado.error)).toEqual(MENSAJE)
  })

  it('el número y la OC de referencia aceptan 50 caracteres sin contar los espacios de los extremos', async () => {
    const numero = 'N'.repeat(50)
    const ocRef = 'O'.repeat(50)
    const id = await registerOk({ ...invoice, monto: 100, numero: ` ${numero} `, numero_oc_ref: ` ${ocRef} ` })
    expect((await sql('select numero, numero_oc_ref from public.documentos where id = $1', [id]))[0]).toEqual({
      numero,
      numero_oc_ref: ocRef,
    })
  })

  it('permite conservar la fecha vacía y descarta los otros campos opcionales vacíos', async () => {
    const id = await registerOk({ tipo: 'remito', fecha: '', periodo_desde: '', periodo_hasta: '', equipo_id: '' })
    const fields = async () =>
      (
        await sql(
          `select fecha is not null as with_date, fecha_vencimiento, periodo_desde, periodo_hasta, equipo_id
           from public.documentos where id = $1`,
          [id],
        )
      )[0]
    const vacios = { with_date: false, fecha_vencimiento: null, periodo_desde: null, periodo_hasta: null, equipo_id: null }
    expect(await fields()).toEqual(vacios)

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id,
      p_datos: { tipo: 'remito', fecha: '', fecha_vencimiento: '', periodo_desde: '', periodo_hasta: '', equipo_id: '', notas: MARCA },
    })
    expect(error).toBeNull()
    expect(await fields()).toEqual(vacios)
  })

  it('las columnas que no son del formulario no se toman de p_datos', async () => {
    const ajenas = { id: 'abc', factura_id: 'abc', deleted_at: 'abc', deleted_by: 'abc', created_by: 'abc', created_at: 'abc' }
    const id = await registerOk({ tipo: 'remito', ...ajenas })

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id,
      p_datos: { tipo: 'remito', ...ajenas, notas: MARCA },
    })
    expect(error).toBeNull()
    expect((await sql('select deleted_at, factura_id from public.documentos where id = $1', [id]))[0]).toEqual({
      deleted_at: null,
      factura_id: null,
    })
  })

  it('los campos que no son del tipo se descartan en vez de chocar con los CHECK', async () => {
    const fieldsOf = async (id: string) =>
      (
        await sql(
          `select tipo_comprobante, fecha_vencimiento, numero_oc_ref, periodo_desde, periodo_hasta, equipo_id
           from public.documentos where id = $1`,
          [id],
        )
      )[0]
    const vacios = {
      tipo_comprobante: null,
      fecha_vencimiento: null,
      numero_oc_ref: '',
      periodo_desde: null,
      periodo_hasta: null,
      equipo_id: null,
    }
    const ofInvoice = { tipo_comprobante: 'FA', fecha_vencimiento: '2026-11-30', numero_oc_ref: 'OC-1' }
    const ofDeliveryNote = { periodo_desde: '2026-10-01', periodo_hasta: '2026-10-05', equipo_id: ids.equipo_id }

    const deliveryNote = await register({ tipo: 'remito', ...ofInvoice })
    expect(deliveryNote.error).toBeNull()
    expect(await fieldsOf(deliveryNote.data!)).toEqual(vacios)

    const invoice = await register({ tipo: 'factura', monto: 100, ...ofInvoice, ...ofDeliveryNote })
    expect(invoice.error).toBeNull()
    expect(await fieldsOf(invoice.data!)).toMatchObject({ tipo_comprobante: 'FA', numero_oc_ref: 'OC-1', periodo_desde: null, equipo_id: null })

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: deliveryNote.data!,
      p_datos: { tipo: 'orden_compra', ...ofInvoice, ...ofDeliveryNote, notas: MARCA },
    })
    expect(error).toBeNull()
    expect(await fieldsOf(deliveryNote.data!)).toEqual(vacios)
  })
})

describe('actualizar, archivos, anular y restaurar', () => {
  it('corrige el tipo de un documento sin vínculos (subí la factura como remito)', async () => {
    const id = await registerOk({ tipo: 'remito', numero: 'F-1', periodo_desde: '2026-10-01' })
    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id,
      p_datos: { tipo: 'factura', numero: 'F-1', monto: 300, tipo_comprobante: 'FA', notas: MARCA },
      p_presupuestos: [budget],
    })
    expect(error).toBeNull()
    const [doc] = await sql<{ tipo: string; periodo_desde: string | null }>(
      'select tipo, periodo_desde from public.documentos where id = $1',
      [id],
    )
    expect(doc).toEqual({ tipo: 'factura', periodo_desde: null })
  })

  it('no cambia el tipo si tiene vínculos ni baja el monto por debajo de lo cobrado', async () => {
    const invoice = await registerOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await registerOk({ tipo: 'orden_pago', monto: 600 }, { aplicaciones: [{ factura_id: invoice, monto_aplicado: 600 }] })

    const changeTipo = await activo.client.rpc('actualizar_documento', {
      p_id: invoice,
      p_datos: { tipo: 'remito', notas: MARCA },
      p_presupuestos: [budget],
    })
    expect(changeTipo.error?.message).toMatch(/primero quitá/)

    const amountMenor = await activo.client.rpc('actualizar_documento', {
      p_id: invoice,
      p_datos: { tipo: 'factura', monto: 500, tipo_comprobante: 'FA', notas: MARCA },
      p_presupuestos: [budget],
    })
    expect(amountMenor.error?.message).toMatch(/menor a lo ya cobrado/)
  })

  it('un remito cubierto por una factura no cambia de tipo sin desvincularse', async () => {
    const deliveryNote = await registerOk({ tipo: 'remito' })
    const invoice = await registerOk({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }, { remitos: [deliveryNote] })

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: deliveryNote,
      p_datos: { tipo: 'orden_compra', notas: MARCA },
      p_presupuestos: [budget],
    })
    expect(error?.message).toMatch(/primero quitá/)
    expect((await sql('select tipo, factura_id from public.documentos where id = $1', [deliveryNote]))[0]).toEqual({
      tipo: 'remito',
      factura_id: invoice,
    })
  })

  it('un remito cubierto por una factura anulada sí cambia de tipo (y deja de estar cubierto)', async () => {
    const deliveryNote = await registerOk({ tipo: 'remito' })
    const invoice = await registerOk({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }, { remitos: [deliveryNote] })
    expect((await activo.client.rpc('anular_documento', { p_id: invoice })).error).toBeNull()

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: deliveryNote,
      p_datos: { tipo: 'orden_compra', notas: MARCA },
    })
    expect(error).toBeNull()
    expect((await sql('select tipo, factura_id from public.documentos where id = $1', [deliveryNote]))[0]).toEqual({
      tipo: 'orden_compra',
      factura_id: null,
    })
  })

  describe('presupuestos al corregir', () => {
    const budgetsOf = async (document: string) =>
      (
        await sql<{ cotizacion_id: string }>(
          'select cotizacion_id from public.documento_presupuestos where documento_id = $1 order by cotizacion_id',
          [document],
        )
      ).map((v) => v.cotizacion_id)
    const voidBudget = (id: string) =>
      sql(`update public.cotizaciones set presupuesto_estado = 'anulado' where id = $1`, [id])

    it('sin p_presupuestos conserva los vínculos; una lista los reemplaza, pero no puede ser vacía', async () => {
      const otro = await newBudget(activo.client, ids.cliente_id, MARCA)
      const id = await registerOk({ tipo: 'orden_compra' }, { budgets: [budget, otro] })
      const ambos = [budget, otro].sort()

      const withoutList = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', numero: 'OC-2', notas: MARCA },
      })
      expect(withoutList.error).toBeNull()
      expect(await budgetsOf(id)).toEqual(ambos)

      const empty = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', notas: MARCA },
        p_presupuestos: [],
      })
      expect(empty.error?.message).toMatch(/al menos un presupuesto/)
      expect(await budgetsOf(id)).toEqual(ambos)

      const withList = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', notas: MARCA },
        p_presupuestos: [otro],
      })
      expect(withList.error).toBeNull()
      expect(await budgetsOf(id)).toEqual([otro])
    })

    it('corrige el número de un documento cuyo presupuesto se anuló después', async () => {
      const voided = await newBudget(activo.client, ids.cliente_id, MARCA)
      const id = await registerOk({ tipo: 'orden_compra', numero: 'OC-1' }, { budgets: [voided] })
      await voidBudget(voided)

      const withoutList = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', numero: 'OC-2', notas: MARCA },
      })
      expect(withoutList.error).toBeNull()
      const withList = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', numero: 'OC-3', notas: MARCA },
        p_presupuestos: [voided],
      })
      expect(withList.error).toBeNull()

      expect((await sql('select numero from public.documentos where id = $1', [id]))[0]).toEqual({ numero: 'OC-3' })
      expect(await budgetsOf(id)).toEqual([voided])
    })

    it('no agrega un presupuesto anulado que no tenía', async () => {
      const voided = await newBudget(activo.client, ids.cliente_id, MARCA)
      await voidBudget(voided)
      const id = await registerOk({ tipo: 'orden_compra' })

      const { error } = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', notas: MARCA },
        p_presupuestos: [budget, voided],
      })
      expect(error?.message).toMatch(/no anulados/)
      expect(await budgetsOf(id)).toEqual([budget])
    })
  })

  describe('vínculos de factura y orden de pago al corregir', () => {
    const dataInvoice = { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA', notas: MARCA }
    const dataOp = { tipo: 'orden_pago', monto: 600, notas: MARCA }

    async function invoiceWithDeliveryNoteYOp() {
      const deliveryNote = await registerOk({ tipo: 'remito' })
      const invoice = await registerOk(dataInvoice, { remitos: [deliveryNote] })
      const op = await registerOk(dataOp, { aplicaciones: [{ factura_id: invoice, monto_aplicado: 600 }] })
      return { remito: deliveryNote, factura: invoice, op }
    }
    const deliveryNotesOf = async (invoice: string) =>
      (await sql<{ id: string }>('select id from public.documentos where factura_id = $1', [invoice])).map((r) => r.id)
    const aplicadoBy = (op: string) =>
      sql('select factura_id, monto_aplicado from public.op_facturas where op_id = $1', [op])

    it('sin p_remitos ni p_aplicaciones los conserva (editar datos no desvincula)', async () => {
      const { remito: deliveryNote, factura: invoice, op } = await invoiceWithDeliveryNoteYOp()

      const factura2 = await activo.client.rpc('actualizar_documento', {
        p_id: invoice,
        p_datos: { ...dataInvoice, numero: 'F-2' },
        p_presupuestos: [budget],
      })
      expect(factura2.error).toBeNull()
      const op2 = await activo.client.rpc('actualizar_documento', {
        p_id: op,
        p_datos: { ...dataOp, numero: 'OP-2' },
        p_presupuestos: [budget],
      })
      expect(op2.error).toBeNull()

      expect(await deliveryNotesOf(invoice)).toEqual([deliveryNote])
      expect(await aplicadoBy(op)).toEqual([{ factura_id: invoice, monto_aplicado: '600.00' }])
    })

    it('sin p_aplicaciones, la OP no baja de lo que ya aplicó', async () => {
      const { factura: invoice, op } = await invoiceWithDeliveryNoteYOp()
      const { error } = await activo.client.rpc('actualizar_documento', {
        p_id: op,
        p_datos: { ...dataOp, monto: 500 },
        p_presupuestos: [budget],
      })
      expect(error?.message).toMatch(/supera el monto de la orden de pago/)
      expect(await aplicadoBy(op)).toEqual([{ factura_id: invoice, monto_aplicado: '600.00' }])
    })

    it('una lista vacía sí los quita', async () => {
      const { factura: invoice, op } = await invoiceWithDeliveryNoteYOp()
      const factura2 = await activo.client.rpc('actualizar_documento', {
        p_id: invoice,
        p_datos: dataInvoice,
        p_presupuestos: [budget],
        p_remitos: [],
      })
      expect(factura2.error).toBeNull()
      const op2 = await activo.client.rpc('actualizar_documento', {
        p_id: op,
        p_datos: dataOp,
        p_presupuestos: [budget],
        p_aplicaciones: [],
      })
      expect(op2.error).toBeNull()

      expect(await deliveryNotesOf(invoice)).toEqual([])
      expect(await aplicadoBy(op)).toEqual([])
    })
  })

  it('agrega páginas y quita archivos, pero siempre queda uno', async () => {
    const id = await registerOk({ tipo: 'remito' })
    const pagina = await uploadFile(activo.client, ids.cliente_id, 'Página 2.jpg')
    expect((await activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [pagina] })).error).toBeNull()

    const archivos = await sql<{ id: string; orden: number }>(
      'select id, orden from public.documento_archivos where documento_id = $1 order by orden',
      [id],
    )
    expect(archivos.map((a) => a.orden)).toEqual([1, 2])
    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[0].id })).error).toBeNull()
    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[1].id })).error?.message).toMatch(/al menos un archivo/)
  })

  it('no agrega un archivo que el documento ya tiene', async () => {
    const id = await registerOk({ tipo: 'remito' })
    const [{ path }] = await sql<{ path: string }>('select path from public.documento_archivos where documento_id = $1', [id])

    const { error } = await activo.client.rpc('agregar_archivos', {
      p_documento_id: id,
      p_archivos: [{ path, nombre_original: 'Otra vez.pdf' }],
    })
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: 'P0001',
      message: 'Ese archivo ya está cargado en un documento',
    })
    expect(await sql('select orden from public.documento_archivos where documento_id = $1', [id])).toEqual([{ orden: 1 }])
  })

  it('no agrega archivos a un documento anulado', async () => {
    const id = await registerOk({ tipo: 'remito' })
    expect((await activo.client.rpc('anular_documento', { p_id: id })).error).toBeNull()

    const pagina = await uploadFile(activo.client, ids.cliente_id, 'Página 2.pdf')
    const { error } = await activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [pagina] })
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: 'P0001',
      message: 'El documento no existe o está anulado',
    })
    expect(await sql('select orden from public.documento_archivos where documento_id = $1', [id])).toEqual([{ orden: 1 }])
  })

  it('no quita archivos de un documento anulado', async () => {
    const { id, archivos } = await documentWithDosFiles()
    expect((await activo.client.rpc('anular_documento', { p_id: id })).error).toBeNull()

    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[0] })).error?.message).toMatch(/anulado/)
    expect(await sql('select id from public.documento_archivos where documento_id = $1 order by orden', [id])).toEqual(
      archivos.map((archivo) => ({ id: archivo })),
    )
  })

  it('anular y restaurar; una OP no se restaura si ya no hay saldo', async () => {
    const invoice = await registerOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const op1 = await registerOk(
      { tipo: 'orden_pago', monto: 1000 },
      { aplicaciones: [{ factura_id: invoice, monto_aplicado: 1000 }] },
    )

    expect((await activo.client.rpc('anular_documento', { p_id: op1 })).error).toBeNull()
    await registerOk({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: invoice, monto_aplicado: 1000 }] })
    expect((await activo.client.rpc('restaurar_documento', { p_id: op1 })).error?.message).toMatch(/ya no tiene saldo/)

    const oc = await registerOk({ tipo: 'orden_compra' })
    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()
    expect((await activo.client.rpc('restaurar_documento', { p_id: oc })).error).toBeNull()
  })

  describe('restaurar sin dejar saldo negativo', () => {
    const anular = (id: string) => activo.client.rpc('anular_documento', { p_id: id })
    const restore = (id: string) => activo.client.rpc('restaurar_documento', { p_id: id })
    const cobro = async (invoice: string) =>
      (await sql('select monto, cobrado, saldo from public.v_facturas where id = $1', [invoice]))[0]

    /** Factura de 1000 cobrada por OP2, con OP1 (también de 1000) y la factura anuladas. */
    async function invoiceAnuladaWithOpAnulada() {
      const invoice = await registerOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
      const op = { tipo: 'orden_pago', monto: 1000 }
      const aplicaciones = [{ factura_id: invoice, monto_aplicado: 1000 }]
      const op1 = await registerOk(op, { aplicaciones })
      expect((await anular(op1)).error).toBeNull()
      expect((await register(op, { aplicaciones })).error).toBeNull()
      expect((await anular(invoice)).error).toBeNull()
      return { factura: invoice, op1 }
    }

    it('una OP no se restaura mientras alguna de sus facturas está anulada', async () => {
      const { factura: invoice, op1 } = await invoiceAnuladaWithOpAnulada()

      expect((await restore(op1)).error?.message).toMatch(/alguna factura está anulada/)
      expect((await restore(invoice)).error).toBeNull()
      expect(await cobro(invoice)).toEqual({ monto: '1000.00', cobrado: '1000.00', saldo: '0.00' })
      expect((await restore(op1)).error?.message).toMatch(/ya no tiene saldo/)
      expect(await cobro(invoice)).toEqual({ monto: '1000.00', cobrado: '1000.00', saldo: '0.00' })
    })

    it('una factura no se restaura si las OP vigentes le aplican más que su monto', async () => {
      const { factura: invoice, op1 } = await invoiceAnuladaWithOpAnulada()
      // Un estado que las funciones ya no dejan armar: la OP1 vuelve por fuera mientras la factura está anulada.
      await sql('update public.documentos set deleted_at = null, deleted_by = null where id = $1', [op1])

      expect((await restore(invoice)).error?.message).toMatch(/superan el monto de la factura/)
      expect(await cobro(invoice)).toBeUndefined()
    })
  })
})

describe('concurrencia', () => {
  const saldo = async (invoice: string) =>
    Number((await sql<{ saldo: string }>('select saldo from public.v_facturas where id = $1', [invoice]))[0].saldo)

  it('dos órdenes de pago a la vez no aplican más que el saldo de la factura', async () => {
    const invoice = await registerOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const op = { tipo: 'orden_pago', monto: 1000 }
    const aplicaciones = [{ factura_id: invoice, monto_aplicado: 1000 }]

    const segunda = await contraRegistroInCurso(op, { aplicaciones }, () => register(op, { aplicaciones }))
    expect(segunda.error?.message).toMatch(/supera el saldo/)
    expect(await saldo(invoice)).toBe(0)
  })

  it('una OP anulada no se restaura mientras otra le toma el saldo de la factura', async () => {
    const invoice = await registerOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const op = { tipo: 'orden_pago', monto: 1000 }
    const aplicaciones = [{ factura_id: invoice, monto_aplicado: 1000 }]
    const anulada = await registerOk(op, { aplicaciones })
    expect((await activo.client.rpc('anular_documento', { p_id: anulada })).error).toBeNull()

    const restore = await contraRegistroInCurso(op, { aplicaciones }, () =>
      activo.client.rpc('restaurar_documento', { p_id: anulada }),
    )
    expect(restore.error?.message).toMatch(/ya no tiene saldo/)
    expect(await saldo(invoice)).toBe(0)
  })

  it('dos facturas a la vez no cubren el mismo remito', async () => {
    const deliveryNote = await registerOk({ tipo: 'remito' })
    const invoice = { tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }

    const segunda = await contraRegistroInCurso(invoice, { remitos: [deliveryNote] }, () => register(invoice, { remitos: [deliveryNote] }))
    expect(segunda.error?.message).toMatch(/ya está cubierto por otra factura/)
  })

  it('dos quitas de archivo a la vez dejan al documento con uno', async () => {
    const { id, archivos } = await documentWithDosFiles()

    const segunda = await contraTransaccionInCurso(activo.id, 'select public.quitar_archivo($1)', [archivos[0]], () =>
      activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[1] }),
    )
    expect(segunda.error?.message).toMatch(/al menos un archivo/)
    expect(await sql('select id from public.documento_archivos where documento_id = $1', [id])).toEqual([{ id: archivos[1] }])
  })

  it('dos agregados de archivos a la vez numeran las páginas 1, 2 y 3', async () => {
    const id = await registerOk({ tipo: 'remito' })
    const pagina2 = await uploadFile(activo.client, ids.cliente_id, 'Página 2.pdf')
    const pagina3 = await uploadFile(activo.client, ids.cliente_id, 'Página 3.pdf')

    const segunda = await contraTransaccionInCurso(
      activo.id,
      'select public.agregar_archivos($1, $2::jsonb)',
      [id, JSON.stringify([pagina2])],
      () => activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [pagina3] }),
    )
    expect(segunda.error).toBeNull()
    const archivos = await sql<{ path: string; orden: number }>(
      'select path, orden from public.documento_archivos where documento_id = $1 order by orden',
      [id],
    )
    expect(archivos.map((a) => a.orden)).toEqual([1, 2, 3])
    expect(archivos.slice(1).map((a) => a.path)).toEqual([pagina2.path, pagina3.path])
  })
})
