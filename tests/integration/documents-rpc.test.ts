// tests/integration/documentos-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/lib/supabase/database.types'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarArchivosSubidos, limpiarDocumentos, nuevoPresupuesto, subirArchivo, subirArchivoEn } from './documentos-helpers'
import { borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
let presupuesto: string

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
  presupuesto = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
})

afterAll(async () => {
  try {
    await limpiarDocumentos(MARCA)
    await limpiarArchivosSubidos()
  } finally {
    for (const u of [activo, inactivo]) await borrarUsuario(u.id)
  }
})

async function registrar(
  datos: Record<string, unknown>,
  extra: { presupuestos?: string[]; remitos?: string[]; aplicaciones?: Json[] } = {},
) {
  const archivo = await subirArchivo(activo.client, ids.cliente_id)
  return activo.client.rpc('registrar_documento', {
    p_datos: { cliente_id: ids.cliente_id, notas: MARCA, ...datos },
    p_presupuestos: extra.presupuestos ?? [presupuesto],
    p_archivos: [archivo],
    p_remitos: extra.remitos ?? [],
    p_aplicaciones: extra.aplicaciones ?? [],
  })
}

/** Como `registrar`, para preparar datos: si falla tira un error que dice qué pasó, y si no devuelve el id. */
async function registrarOk(datos: Record<string, unknown>, extra: Parameters<typeof registrar>[1] = {}): Promise<string> {
  const { data, error } = await registrar(datos, extra)
  if (error) throw new Error(`No se pudo registrar el documento (${String(datos.tipo)}): ` + error.message)
  return data
}

/** Corre `llamada` mientras otra transacción tiene a medio registrar un documento. */
async function contraRegistroEnCurso<T>(
  datos: Record<string, unknown>,
  extra: { remitos?: string[]; aplicaciones?: Json[] },
  llamada: () => PromiseLike<T>,
): Promise<T> {
  const archivo = await subirArchivo(activo.client, ids.cliente_id)
  return contraTransaccionEnCurso(
    activo.id,
    'select public.registrar_documento($1::jsonb, $2::uuid[], $3::jsonb, $4::uuid[], $5::jsonb)',
    [
      JSON.stringify({ cliente_id: ids.cliente_id, notas: MARCA, ...datos }),
      [presupuesto],
      JSON.stringify([archivo]),
      extra.remitos ?? [],
      JSON.stringify(extra.aplicaciones ?? []),
    ],
    llamada,
  )
}

/** Registra un documento con dos archivos y devuelve los ids de los archivos en orden. */
async function documentoConDosArchivos() {
  const id = await registrarOk({ tipo: 'remito' })
  const pagina = await subirArchivo(activo.client, ids.cliente_id, 'Página 2.jpg')
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
    const { data: id, error } = await registrar({ tipo: 'orden_compra', numero: 'OC-4500012345' })
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
    expect(vinculos).toEqual([{ cotizacion_id: presupuesto }])
  })

  it('exige presupuesto, archivo y que el archivo exista en Storage', async () => {
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [] })).error?.message).toMatch(/al menos un presupuesto/)

    const sinArchivo = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [],
    })
    expect(sinArchivo.error?.message).toMatch(/al menos un archivo/)

    const inexistente = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [{ path: `documentos/${ids.cliente_id}/${crypto.randomUUID()}.pdf`, nombre_original: 'x.pdf' }],
    })
    expect(inexistente.error?.message).toMatch(/No se encontró el archivo/)
  })

  it('el archivo tiene que tener nombre y no estar vacío', async () => {
    const registrarCon = (archivo: { path: string; nombre_original: string }) =>
      activo.client.rpc('registrar_documento', {
        p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
        p_presupuestos: [presupuesto],
        p_archivos: [archivo],
      })

    const sinNombre = await registrarCon({ ...(await subirArchivo(activo.client, ids.cliente_id)), nombre_original: '  ' })
    expect({ code: sinNombre.error?.code, message: sinNombre.error?.message }).toEqual({
      code: 'P0001',
      message: 'Falta el nombre del archivo',
    })

    const vacio = await subirArchivoEn(activo.client, `documentos/${ids.cliente_id}/${crypto.randomUUID()}.pdf`, 'Vacío.pdf', '')
    const conArchivoVacio = await registrarCon(vacio)
    expect({ code: conArchivoVacio.error?.code, message: conArchivoVacio.error?.message }).toEqual({
      code: 'P0001',
      message: 'El archivo está vacío',
    })
  })

  it('un mismo archivo no se vincula a dos documentos', async () => {
    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const llamada = () =>
      activo.client.rpc('registrar_documento', {
        p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
        p_presupuestos: [presupuesto],
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
    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const { error } = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [archivo, archivo],
    })
    expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: 'Un archivo aparece dos veces' })
  })

  it('no carga documentos en presupuestos de otro cliente ni en anulados', async () => {
    const otro = await nuevoPresupuesto(activo.client, ids.cliente_con_contacto_id, MARCA)
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [otro] })).error?.message).toMatch(/mismo cliente/)

    const anulado = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await sql(`update public.cotizaciones set presupuesto_estado = 'anulado' where id = $1`, [anulado])
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [anulado] })).error?.message).toMatch(/no anulados/)
  })

  it('una factura cubre remitos y una OP cancela facturas con monto aplicado', async () => {
    const remito = await registrarOk({ tipo: 'remito', numero: 'R-1' })
    const { data: factura, error } = await registrar(
      { tipo: 'factura', numero: '0001-00000123', monto: 1000, tipo_comprobante: 'FA' },
      { remitos: [remito] },
    )
    expect(error).toBeNull()
    expect((await sql('select factura_id from public.documentos where id = $1', [remito]))[0]).toEqual({ factura_id: factura })

    const { error: errorOp } = await registrar(
      { tipo: 'orden_pago', numero: 'OP-77', monto: 1000 },
      { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] },
    )
    expect(errorOp).toBeNull()
    const [vf] = await sql<{ saldo: string }>('select saldo from public.v_facturas where id = $1', [factura])
    expect(Number(vf.saldo)).toBe(0)
  })

  it('un remito cubierto por otra factura vigente no se le saca; el de una factura anulada, sí', async () => {
    const datosFactura = { tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }
    const remito = await registrarOk({ tipo: 'remito' })
    const facturaA = await registrarOk(datosFactura, { remitos: [remito] })
    const facturaDelRemito = async () => (await sql('select factura_id from public.documentos where id = $1', [remito]))[0]

    const reguardar = await activo.client.rpc('actualizar_documento', {
      p_id: facturaA,
      p_datos: { ...datosFactura, notas: MARCA },
      p_presupuestos: [presupuesto],
      p_remitos: [remito],
    })
    expect(reguardar.error).toBeNull()

    expect((await registrar(datosFactura, { remitos: [remito] })).error?.message).toMatch(/ya está cubierto por otra factura/)
    expect(await facturaDelRemito()).toEqual({ factura_id: facturaA })

    expect((await activo.client.rpc('anular_documento', { p_id: facturaA })).error).toBeNull()
    const { data: facturaB, error } = await registrar(datosFactura, { remitos: [remito] })
    expect(error).toBeNull()
    expect(await facturaDelRemito()).toEqual({ factura_id: facturaB })
  })

  it('una OP no aplica más que el saldo de la factura ni más que su propio monto', async () => {
    const factura = await registrarOk({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' })
    expect(
      (await registrar({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })).error?.message,
    ).toMatch(/supera el saldo/)
    expect(
      (await registrar({ tipo: 'orden_pago', monto: 100 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 200 }] })).error?.message,
    ).toMatch(/supera el monto de la orden de pago/)
  })

  describe('facturas canceladas por una orden de pago', () => {
    const DECIMALES = 'El monto aplicado tiene que ser un número positivo con hasta 2 decimales'
    const MAXIMO = 'El monto supera el máximo permitido'
    let factura: string
    beforeAll(async () => {
      factura = await registrarOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    })
    const op = (aplicaciones: Json[]) => registrar({ tipo: 'orden_pago', monto: 100 }, { aplicaciones })
    const resultado = (error: { code?: string; message: string } | null) => ({ code: error?.code, message: error?.message })

    it.each<[string, Json, string]>([
      ['con más de 2 decimales (no se redondea)', 33.335, DECIMALES],
      ['que redondeado da cero', 0.001, DECIMALES],
      ['con letras', 'abc', DECIMALES],
      ['negativo', -5, DECIMALES],
      ['con más de 12 dígitos enteros', 1234567890123, MAXIMO],
      ['que falta', null, DECIMALES],
      ['cero', '0.00', 'El monto aplicado tiene que ser mayor a cero'],
    ])('rechaza un monto aplicado %s', async (_, monto, mensaje) => {
      const { error } = await op([{ factura_id: factura, monto_aplicado: monto }])
      expect(resultado(error)).toEqual({ code: 'P0001', message: mensaje })
    })

    it('rechaza una aplicación sin factura o con una factura que no es un id', async () => {
      for (const aplicacion of [{ monto_aplicado: 10 }, { factura_id: 'abc', monto_aplicado: 10 }, 5]) {
        const { error } = await op([aplicacion])
        expect(resultado(error)).toEqual({ code: 'P0001', message: 'Falta la factura en una de las facturas canceladas' })
      }
    })

    it('la misma factura en minúsculas y en mayúsculas cuenta como repetida', async () => {
      const { error } = await op([
        { factura_id: factura, monto_aplicado: 10 },
        { factura_id: factura.toUpperCase(), monto_aplicado: 10 },
      ])
      expect(resultado(error)).toEqual({ code: 'P0001', message: 'Una factura aparece dos veces en la orden de pago' })
    })

    it('rechaza lo aplicado que supera la orden de pago aunque la suma pase de 12 dígitos enteros', async () => {
      const MAXIMO = 999999999999.99
      const facturas: string[] = []
      for (let i = 0; i < 2; i++) facturas.push(await registrarOk({ tipo: 'factura', monto: MAXIMO, tipo_comprobante: 'FA' }))
      const { error } = await registrar(
        { tipo: 'orden_pago', monto: MAXIMO },
        { aplicaciones: facturas.map((factura_id) => ({ factura_id, monto_aplicado: 600000000000 })) },
      )
      expect(resultado(error)).toEqual({ code: 'P0001', message: 'Lo aplicado a facturas supera el monto de la orden de pago' })
    })

    it('guarda el monto aplicado tal cual, con hasta 2 decimales', async () => {
      const { data: id, error } = await op([{ factura_id: factura, monto_aplicado: 33.33 }])
      expect(error).toBeNull()
      expect(await sql('select monto_aplicado from public.op_facturas where op_id = $1', [id])).toEqual([{ monto_aplicado: '33.33' }])
    })
  })

  it('remitos solo en facturas', async () => {
    const remito = await registrarOk({ tipo: 'remito' })
    expect((await registrar({ tipo: 'orden_compra' }, { remitos: [remito] })).error?.message).toMatch(/Solo una factura cubre remitos/)
  })

  it('las facturas canceladas tienen que venir como lista', async () => {
    const archivo = await subirArchivo(activo.client, ids.cliente_id)
    const { error } = await activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [archivo],
      p_aplicaciones: { factura_id: presupuesto, monto_aplicado: 1 },
    })
    expect(error?.code).toBe('P0001')
    expect(error?.message).toMatch(/tienen que ser una lista/)
  })

  it('un usuario inactivo no registra', async () => {
    const { error } = await inactivo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito' },
      p_presupuestos: [presupuesto],
      p_archivos: [],
    })
    expect(error?.code).toBe('42501')
  })
})

describe('ruta del archivo', () => {
  const MENSAJE = 'El archivo no corresponde a la carpeta del cliente'
  const registrarCon = (archivo: { path: string; nombre_original: string }) =>
    activo.client.rpc('registrar_documento', {
      p_datos: { cliente_id: ids.cliente_id, tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
      p_archivos: [archivo],
    })

  it('un archivo subido en la carpeta de otro cliente no se registra ni se agrega', async () => {
    const ajeno = await subirArchivoEn(activo.client, `documentos/${ids.cliente_con_contacto_id}/${crypto.randomUUID()}.pdf`)

    const registro = await registrarCon(ajeno)
    expect({ code: registro.error?.code, message: registro.error?.message }).toEqual({ code: 'P0001', message: MENSAJE })

    const id = await registrarOk({ tipo: 'remito' })
    const agregado = await activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [ajeno] })
    expect({ code: agregado.error?.code, message: agregado.error?.message }).toEqual({ code: 'P0001', message: MENSAJE })
    expect(await sql('select count(*)::int as archivos from public.documento_archivos where documento_id = $1', [id])).toEqual([
      { archivos: 1 },
    ])
  })

  it('una ruta con .. o con una carpeta de más se rechaza', async () => {
    const conCarpetaDeMas = await subirArchivoEn(activo.client, `documentos/${ids.cliente_id}/extra/${crypto.randomUUID()}.pdf`)
    const conPuntos = {
      path: `documentos/${ids.cliente_id}/../${ids.cliente_con_contacto_id}/${crypto.randomUUID()}.pdf`,
      nombre_original: 'x.pdf',
    }
    for (const archivo of [conCarpetaDeMas, conPuntos]) {
      const { error } = await registrarCon(archivo)
      expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: MENSAJE })
    }
  })
})

describe('datos inválidos dan P0001 con el mensaje en castellano, nunca el error de un CHECK', () => {
  const MONTO = 'El monto tiene que ser un número positivo con hasta 2 decimales'
  const MAXIMO = 'El monto supera el máximo permitido'
  const NUMERO_LARGO = 'El número puede tener hasta 50 caracteres'
  const factura = { tipo: 'factura', tipo_comprobante: 'FA' }
  // Más de lo que entra en una fila del índice documentos_numero_normalizado (2704 bytes): sin el control del
  // largo daba un error crudo (54000). Al azar, para que Postgres no lo comprima.
  const numeroEnorme = Array.from({ length: 250 }, () => crypto.randomUUID()).join('')
  const casos: [string, Record<string, unknown>, string][] = [
    ['tipo desconocido', { tipo: 'presupuesto' }, 'Tipo de documento inválido'],
    ['monto con letras', { ...factura, monto: 'abc' }, MONTO],
    ['monto negativo', { ...factura, monto: -5 }, MONTO],
    ['monto cero', { tipo: 'orden_pago', monto: 0 }, MONTO],
    ['monto con 3 decimales', { ...factura, monto: 10.005 }, MONTO],
    ['monto que redondeado da cero', { tipo: 'orden_pago', monto: 0.001 }, MONTO],
    ['monto que no es un número', { ...factura, monto: { valor: 10 } }, MONTO],
    ['monto con más de 12 dígitos enteros', { ...factura, monto: 1234567890123 }, MAXIMO],
    ['monto enorme', { tipo: 'orden_pago', monto: 1e20 }, MAXIMO],
    ['factura sin monto', factura, 'Indicá el monto de la factura'],
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
    ['vencimiento con letras', { ...factura, monto: 100, fecha_vencimiento: 'abc' }, 'Fecha inválida'],
    ['período con letras en un remito', { tipo: 'remito', periodo_hasta: 'abc' }, 'Fecha inválida'],
    ['período con letras en una factura', { ...factura, monto: 100, periodo_desde: 'abc' }, 'Fecha inválida'],
    ['número de más de 50 caracteres', { tipo: 'remito', numero: 'N'.repeat(51) }, NUMERO_LARGO],
    ['número enorme', { tipo: 'remito', numero: numeroEnorme }, NUMERO_LARGO],
    [
      'OC de referencia de más de 50 caracteres',
      { ...factura, monto: 100, numero_oc_ref: 'O'.repeat(51) },
      'La OC de referencia puede tener hasta 50 caracteres',
    ],
    ['notas de más de 2000 caracteres', { tipo: 'remito', notas: 'x'.repeat(2001) }, 'Las notas pueden tener hasta 2000 caracteres'],
  ]
  const resultado = (error: { code?: string; message: string } | null) => ({ code: error?.code, message: error?.message })

  it.each([...casos, ['sin tipo', {}, 'Tipo de documento inválido'] as (typeof casos)[number]])(
    'registrar_documento: %s',
    async (_, datos, mensaje) => {
      expect(resultado((await registrar(datos)).error)).toEqual({ code: 'P0001', message: mensaje })
    },
  )

  it.each(casos)('actualizar_documento: %s', async (_, datos, mensaje) => {
    const remito = await registrarOk({ tipo: 'remito', numero: 'R-sin-vinculos' })
    const { error } = await activo.client.rpc('actualizar_documento', { p_id: remito, p_datos: { notas: MARCA, ...datos } })
    expect(resultado(error)).toEqual({ code: 'P0001', message: mensaje })
    expect((await sql('select tipo, numero from public.documentos where id = $1', [remito]))[0]).toEqual({
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
      p_presupuestos: [presupuesto],
      p_archivos: [await subirArchivo(activo.client, ids.cliente_id)],
    })
    expect(resultado(registrado.error)).toEqual(MENSAJE)

    const remito = await registrarOk({ tipo: 'remito' })
    const actualizado = await activo.client.rpc('actualizar_documento', { p_id: remito, p_datos: datos })
    expect(resultado(actualizado.error)).toEqual(MENSAJE)
  })

  it('el número y la OC de referencia aceptan 50 caracteres sin contar los espacios de los extremos', async () => {
    const numero = 'N'.repeat(50)
    const ocRef = 'O'.repeat(50)
    const id = await registrarOk({ ...factura, monto: 100, numero: ` ${numero} `, numero_oc_ref: ` ${ocRef} ` })
    expect((await sql('select numero, numero_oc_ref from public.documentos where id = $1', [id]))[0]).toEqual({
      numero,
      numero_oc_ref: ocRef,
    })
  })

  it('permite conservar la fecha vacía y descarta los otros campos opcionales vacíos', async () => {
    const id = await registrarOk({ tipo: 'remito', fecha: '', periodo_desde: '', periodo_hasta: '', equipo_id: '' })
    const campos = async () =>
      (
        await sql(
          `select fecha is not null as con_fecha, fecha_vencimiento, periodo_desde, periodo_hasta, equipo_id
           from public.documentos where id = $1`,
          [id],
        )
      )[0]
    const vacios = { con_fecha: false, fecha_vencimiento: null, periodo_desde: null, periodo_hasta: null, equipo_id: null }
    expect(await campos()).toEqual(vacios)

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id,
      p_datos: { tipo: 'remito', fecha: '', fecha_vencimiento: '', periodo_desde: '', periodo_hasta: '', equipo_id: '', notas: MARCA },
    })
    expect(error).toBeNull()
    expect(await campos()).toEqual(vacios)
  })

  it('las columnas que no son del formulario no se toman de p_datos', async () => {
    const ajenas = { id: 'abc', factura_id: 'abc', deleted_at: 'abc', deleted_by: 'abc', created_by: 'abc', created_at: 'abc' }
    const id = await registrarOk({ tipo: 'remito', ...ajenas })

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
    const camposDe = async (id: string) =>
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
    const deFactura = { tipo_comprobante: 'FA', fecha_vencimiento: '2026-11-30', numero_oc_ref: 'OC-1' }
    const deRemito = { periodo_desde: '2026-10-01', periodo_hasta: '2026-10-05', equipo_id: ids.equipo_id }

    const remito = await registrar({ tipo: 'remito', ...deFactura })
    expect(remito.error).toBeNull()
    expect(await camposDe(remito.data!)).toEqual(vacios)

    const factura = await registrar({ tipo: 'factura', monto: 100, ...deFactura, ...deRemito })
    expect(factura.error).toBeNull()
    expect(await camposDe(factura.data!)).toMatchObject({ tipo_comprobante: 'FA', numero_oc_ref: 'OC-1', periodo_desde: null, equipo_id: null })

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: remito.data!,
      p_datos: { tipo: 'orden_compra', ...deFactura, ...deRemito, notas: MARCA },
    })
    expect(error).toBeNull()
    expect(await camposDe(remito.data!)).toEqual(vacios)
  })
})

describe('actualizar, archivos, anular y restaurar', () => {
  it('corrige el tipo de un documento sin vínculos (subí la factura como remito)', async () => {
    const id = await registrarOk({ tipo: 'remito', numero: 'F-1', periodo_desde: '2026-10-01' })
    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id,
      p_datos: { tipo: 'factura', numero: 'F-1', monto: 300, tipo_comprobante: 'FA', notas: MARCA },
      p_presupuestos: [presupuesto],
    })
    expect(error).toBeNull()
    const [doc] = await sql<{ tipo: string; periodo_desde: string | null }>(
      'select tipo, periodo_desde from public.documentos where id = $1',
      [id],
    )
    expect(doc).toEqual({ tipo: 'factura', periodo_desde: null })
  })

  it('no cambia el tipo si tiene vínculos ni baja el monto por debajo de lo cobrado', async () => {
    const factura = await registrarOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await registrarOk({ tipo: 'orden_pago', monto: 600 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })

    const cambioTipo = await activo.client.rpc('actualizar_documento', {
      p_id: factura,
      p_datos: { tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
    })
    expect(cambioTipo.error?.message).toMatch(/primero quitá/)

    const montoMenor = await activo.client.rpc('actualizar_documento', {
      p_id: factura,
      p_datos: { tipo: 'factura', monto: 500, tipo_comprobante: 'FA', notas: MARCA },
      p_presupuestos: [presupuesto],
    })
    expect(montoMenor.error?.message).toMatch(/menor a lo ya cobrado/)
  })

  it('un remito cubierto por una factura no cambia de tipo sin desvincularse', async () => {
    const remito = await registrarOk({ tipo: 'remito' })
    const factura = await registrarOk({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }, { remitos: [remito] })

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: remito,
      p_datos: { tipo: 'orden_compra', notas: MARCA },
      p_presupuestos: [presupuesto],
    })
    expect(error?.message).toMatch(/primero quitá/)
    expect((await sql('select tipo, factura_id from public.documentos where id = $1', [remito]))[0]).toEqual({
      tipo: 'remito',
      factura_id: factura,
    })
  })

  it('un remito cubierto por una factura anulada sí cambia de tipo (y deja de estar cubierto)', async () => {
    const remito = await registrarOk({ tipo: 'remito' })
    const factura = await registrarOk({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }, { remitos: [remito] })
    expect((await activo.client.rpc('anular_documento', { p_id: factura })).error).toBeNull()

    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: remito,
      p_datos: { tipo: 'orden_compra', notas: MARCA },
    })
    expect(error).toBeNull()
    expect((await sql('select tipo, factura_id from public.documentos where id = $1', [remito]))[0]).toEqual({
      tipo: 'orden_compra',
      factura_id: null,
    })
  })

  describe('presupuestos al corregir', () => {
    const presupuestosDe = async (documento: string) =>
      (
        await sql<{ cotizacion_id: string }>(
          'select cotizacion_id from public.documento_presupuestos where documento_id = $1 order by cotizacion_id',
          [documento],
        )
      ).map((v) => v.cotizacion_id)
    const anularPresupuesto = (id: string) =>
      sql(`update public.cotizaciones set presupuesto_estado = 'anulado' where id = $1`, [id])

    it('sin p_presupuestos conserva los vínculos; una lista los reemplaza, pero no puede ser vacía', async () => {
      const otro = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
      const id = await registrarOk({ tipo: 'orden_compra' }, { presupuestos: [presupuesto, otro] })
      const ambos = [presupuesto, otro].sort()

      const sinLista = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', numero: 'OC-2', notas: MARCA },
      })
      expect(sinLista.error).toBeNull()
      expect(await presupuestosDe(id)).toEqual(ambos)

      const vacia = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', notas: MARCA },
        p_presupuestos: [],
      })
      expect(vacia.error?.message).toMatch(/al menos un presupuesto/)
      expect(await presupuestosDe(id)).toEqual(ambos)

      const conLista = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', notas: MARCA },
        p_presupuestos: [otro],
      })
      expect(conLista.error).toBeNull()
      expect(await presupuestosDe(id)).toEqual([otro])
    })

    it('corrige el número de un documento cuyo presupuesto se anuló después', async () => {
      const anulado = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
      const id = await registrarOk({ tipo: 'orden_compra', numero: 'OC-1' }, { presupuestos: [anulado] })
      await anularPresupuesto(anulado)

      const sinLista = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', numero: 'OC-2', notas: MARCA },
      })
      expect(sinLista.error).toBeNull()
      const conLista = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', numero: 'OC-3', notas: MARCA },
        p_presupuestos: [anulado],
      })
      expect(conLista.error).toBeNull()

      expect((await sql('select numero from public.documentos where id = $1', [id]))[0]).toEqual({ numero: 'OC-3' })
      expect(await presupuestosDe(id)).toEqual([anulado])
    })

    it('no agrega un presupuesto anulado que no tenía', async () => {
      const anulado = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
      await anularPresupuesto(anulado)
      const id = await registrarOk({ tipo: 'orden_compra' })

      const { error } = await activo.client.rpc('actualizar_documento', {
        p_id: id,
        p_datos: { tipo: 'orden_compra', notas: MARCA },
        p_presupuestos: [presupuesto, anulado],
      })
      expect(error?.message).toMatch(/no anulados/)
      expect(await presupuestosDe(id)).toEqual([presupuesto])
    })
  })

  describe('vínculos de factura y orden de pago al corregir', () => {
    const datosFactura = { tipo: 'factura', monto: 1000, tipo_comprobante: 'FA', notas: MARCA }
    const datosOp = { tipo: 'orden_pago', monto: 600, notas: MARCA }

    async function facturaConRemitoYOp() {
      const remito = await registrarOk({ tipo: 'remito' })
      const factura = await registrarOk(datosFactura, { remitos: [remito] })
      const op = await registrarOk(datosOp, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })
      return { remito, factura, op }
    }
    const remitosDe = async (factura: string) =>
      (await sql<{ id: string }>('select id from public.documentos where factura_id = $1', [factura])).map((r) => r.id)
    const aplicadoPor = (op: string) =>
      sql('select factura_id, monto_aplicado from public.op_facturas where op_id = $1', [op])

    it('sin p_remitos ni p_aplicaciones los conserva (editar datos no desvincula)', async () => {
      const { remito, factura, op } = await facturaConRemitoYOp()

      const factura2 = await activo.client.rpc('actualizar_documento', {
        p_id: factura,
        p_datos: { ...datosFactura, numero: 'F-2' },
        p_presupuestos: [presupuesto],
      })
      expect(factura2.error).toBeNull()
      const op2 = await activo.client.rpc('actualizar_documento', {
        p_id: op,
        p_datos: { ...datosOp, numero: 'OP-2' },
        p_presupuestos: [presupuesto],
      })
      expect(op2.error).toBeNull()

      expect(await remitosDe(factura)).toEqual([remito])
      expect(await aplicadoPor(op)).toEqual([{ factura_id: factura, monto_aplicado: '600.00' }])
    })

    it('sin p_aplicaciones, la OP no baja de lo que ya aplicó', async () => {
      const { factura, op } = await facturaConRemitoYOp()
      const { error } = await activo.client.rpc('actualizar_documento', {
        p_id: op,
        p_datos: { ...datosOp, monto: 500 },
        p_presupuestos: [presupuesto],
      })
      expect(error?.message).toMatch(/supera el monto de la orden de pago/)
      expect(await aplicadoPor(op)).toEqual([{ factura_id: factura, monto_aplicado: '600.00' }])
    })

    it('una lista vacía sí los quita', async () => {
      const { factura, op } = await facturaConRemitoYOp()
      const factura2 = await activo.client.rpc('actualizar_documento', {
        p_id: factura,
        p_datos: datosFactura,
        p_presupuestos: [presupuesto],
        p_remitos: [],
      })
      expect(factura2.error).toBeNull()
      const op2 = await activo.client.rpc('actualizar_documento', {
        p_id: op,
        p_datos: datosOp,
        p_presupuestos: [presupuesto],
        p_aplicaciones: [],
      })
      expect(op2.error).toBeNull()

      expect(await remitosDe(factura)).toEqual([])
      expect(await aplicadoPor(op)).toEqual([])
    })
  })

  it('agrega páginas y quita archivos, pero siempre queda uno', async () => {
    const id = await registrarOk({ tipo: 'remito' })
    const pagina = await subirArchivo(activo.client, ids.cliente_id, 'Página 2.jpg')
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
    const id = await registrarOk({ tipo: 'remito' })
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
    const id = await registrarOk({ tipo: 'remito' })
    expect((await activo.client.rpc('anular_documento', { p_id: id })).error).toBeNull()

    const pagina = await subirArchivo(activo.client, ids.cliente_id, 'Página 2.pdf')
    const { error } = await activo.client.rpc('agregar_archivos', { p_documento_id: id, p_archivos: [pagina] })
    expect({ code: error?.code, message: error?.message }).toEqual({
      code: 'P0001',
      message: 'El documento no existe o está anulado',
    })
    expect(await sql('select orden from public.documento_archivos where documento_id = $1', [id])).toEqual([{ orden: 1 }])
  })

  it('no quita archivos de un documento anulado', async () => {
    const { id, archivos } = await documentoConDosArchivos()
    expect((await activo.client.rpc('anular_documento', { p_id: id })).error).toBeNull()

    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[0] })).error?.message).toMatch(/anulado/)
    expect(await sql('select id from public.documento_archivos where documento_id = $1 order by orden', [id])).toEqual(
      archivos.map((archivo) => ({ id: archivo })),
    )
  })

  it('anular y restaurar; una OP no se restaura si ya no hay saldo', async () => {
    const factura = await registrarOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const op1 = await registrarOk(
      { tipo: 'orden_pago', monto: 1000 },
      { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] },
    )

    expect((await activo.client.rpc('anular_documento', { p_id: op1 })).error).toBeNull()
    await registrarOk({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] })
    expect((await activo.client.rpc('restaurar_documento', { p_id: op1 })).error?.message).toMatch(/ya no tiene saldo/)

    const oc = await registrarOk({ tipo: 'orden_compra' })
    expect((await activo.client.rpc('anular_documento', { p_id: oc })).error).toBeNull()
    expect((await activo.client.rpc('restaurar_documento', { p_id: oc })).error).toBeNull()
  })

  describe('restaurar sin dejar saldo negativo', () => {
    const anular = (id: string) => activo.client.rpc('anular_documento', { p_id: id })
    const restaurar = (id: string) => activo.client.rpc('restaurar_documento', { p_id: id })
    const cobro = async (factura: string) =>
      (await sql('select monto, cobrado, saldo from public.v_facturas where id = $1', [factura]))[0]

    /** Factura de 1000 cobrada por OP2, con OP1 (también de 1000) y la factura anuladas. */
    async function facturaAnuladaConOpAnulada() {
      const factura = await registrarOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
      const op = { tipo: 'orden_pago', monto: 1000 }
      const aplicaciones = [{ factura_id: factura, monto_aplicado: 1000 }]
      const op1 = await registrarOk(op, { aplicaciones })
      expect((await anular(op1)).error).toBeNull()
      expect((await registrar(op, { aplicaciones })).error).toBeNull()
      expect((await anular(factura)).error).toBeNull()
      return { factura, op1 }
    }

    it('una OP no se restaura mientras alguna de sus facturas está anulada', async () => {
      const { factura, op1 } = await facturaAnuladaConOpAnulada()

      expect((await restaurar(op1)).error?.message).toMatch(/alguna factura está anulada/)
      expect((await restaurar(factura)).error).toBeNull()
      expect(await cobro(factura)).toEqual({ monto: '1000.00', cobrado: '1000.00', saldo: '0.00' })
      expect((await restaurar(op1)).error?.message).toMatch(/ya no tiene saldo/)
      expect(await cobro(factura)).toEqual({ monto: '1000.00', cobrado: '1000.00', saldo: '0.00' })
    })

    it('una factura no se restaura si las OP vigentes le aplican más que su monto', async () => {
      const { factura, op1 } = await facturaAnuladaConOpAnulada()
      // Un estado que las funciones ya no dejan armar: la OP1 vuelve por fuera mientras la factura está anulada.
      await sql('update public.documentos set deleted_at = null, deleted_by = null where id = $1', [op1])

      expect((await restaurar(factura)).error?.message).toMatch(/superan el monto de la factura/)
      expect(await cobro(factura)).toBeUndefined()
    })
  })
})

describe('concurrencia', () => {
  const saldo = async (factura: string) =>
    Number((await sql<{ saldo: string }>('select saldo from public.v_facturas where id = $1', [factura]))[0].saldo)

  it('dos órdenes de pago a la vez no aplican más que el saldo de la factura', async () => {
    const factura = await registrarOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const op = { tipo: 'orden_pago', monto: 1000 }
    const aplicaciones = [{ factura_id: factura, monto_aplicado: 1000 }]

    const segunda = await contraRegistroEnCurso(op, { aplicaciones }, () => registrar(op, { aplicaciones }))
    expect(segunda.error?.message).toMatch(/supera el saldo/)
    expect(await saldo(factura)).toBe(0)
  })

  it('una OP anulada no se restaura mientras otra le toma el saldo de la factura', async () => {
    const factura = await registrarOk({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const op = { tipo: 'orden_pago', monto: 1000 }
    const aplicaciones = [{ factura_id: factura, monto_aplicado: 1000 }]
    const anulada = await registrarOk(op, { aplicaciones })
    expect((await activo.client.rpc('anular_documento', { p_id: anulada })).error).toBeNull()

    const restaurar = await contraRegistroEnCurso(op, { aplicaciones }, () =>
      activo.client.rpc('restaurar_documento', { p_id: anulada }),
    )
    expect(restaurar.error?.message).toMatch(/ya no tiene saldo/)
    expect(await saldo(factura)).toBe(0)
  })

  it('dos facturas a la vez no cubren el mismo remito', async () => {
    const remito = await registrarOk({ tipo: 'remito' })
    const factura = { tipo: 'factura', monto: 500, tipo_comprobante: 'FA' }

    const segunda = await contraRegistroEnCurso(factura, { remitos: [remito] }, () => registrar(factura, { remitos: [remito] }))
    expect(segunda.error?.message).toMatch(/ya está cubierto por otra factura/)
  })

  it('dos quitas de archivo a la vez dejan al documento con uno', async () => {
    const { id, archivos } = await documentoConDosArchivos()

    const segunda = await contraTransaccionEnCurso(activo.id, 'select public.quitar_archivo($1)', [archivos[0]], () =>
      activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[1] }),
    )
    expect(segunda.error?.message).toMatch(/al menos un archivo/)
    expect(await sql('select id from public.documento_archivos where documento_id = $1', [id])).toEqual([{ id: archivos[1] }])
  })

  it('dos agregados de archivos a la vez numeran las páginas 1, 2 y 3', async () => {
    const id = await registrarOk({ tipo: 'remito' })
    const pagina2 = await subirArchivo(activo.client, ids.cliente_id, 'Página 2.pdf')
    const pagina3 = await subirArchivo(activo.client, ids.cliente_id, 'Página 3.pdf')

    const segunda = await contraTransaccionEnCurso(
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
