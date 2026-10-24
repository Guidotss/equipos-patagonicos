// tests/integration/documentos-rpc.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/lib/supabase/database.types'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { limpiarDocumentos, nuevoPresupuesto, subirArchivo } from './documentos-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

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
  await limpiarDocumentos(MARCA)
  for (const u of [activo, inactivo]) await borrarUsuario(u.id)
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
      p_archivos: [{ path: `documentos/${ids.cliente_id}/no-existe.pdf`, nombre_original: 'x.pdf' }],
    })
    expect(inexistente.error?.message).toMatch(/No se encontró el archivo/)
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
    expect((await llamada()).error).not.toBeNull()
  })

  it('no carga documentos en presupuestos de otro cliente ni en anulados', async () => {
    const otro = await nuevoPresupuesto(activo.client, ids.cliente_con_contacto_id, MARCA)
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [otro] })).error?.message).toMatch(/mismo cliente/)

    const anulado = await nuevoPresupuesto(activo.client, ids.cliente_id, MARCA)
    await sql(`update public.cotizaciones set presupuesto_estado = 'anulado' where id = $1`, [anulado])
    expect((await registrar({ tipo: 'remito' }, { presupuestos: [anulado] })).error?.message).toMatch(/no anulados/)
  })

  it('una factura cubre remitos y una OP cancela facturas con monto aplicado', async () => {
    const { data: remito } = await registrar({ tipo: 'remito', numero: 'R-1' })
    const { data: factura, error } = await registrar(
      { tipo: 'factura', numero: '0001-00000123', monto: 1000, tipo_comprobante: 'FA' },
      { remitos: [remito!] },
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

  it('una OP no aplica más que el saldo de la factura ni más que su propio monto', async () => {
    const { data: factura } = await registrar({ tipo: 'factura', monto: 500, tipo_comprobante: 'FA' })
    expect(
      (await registrar({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })).error?.message,
    ).toMatch(/supera el saldo/)
    expect(
      (await registrar({ tipo: 'orden_pago', monto: 100 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 200 }] })).error?.message,
    ).toMatch(/supera el monto de la orden de pago/)
  })

  it('remitos solo en facturas', async () => {
    const { data: remito } = await registrar({ tipo: 'remito' })
    expect((await registrar({ tipo: 'orden_compra' }, { remitos: [remito!] })).error?.message).toMatch(/Solo una factura cubre remitos/)
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

describe('actualizar, archivos, anular y restaurar', () => {
  it('corrige el tipo de un documento sin vínculos (subí la factura como remito)', async () => {
    const { data: id } = await registrar({ tipo: 'remito', numero: 'F-1', periodo_desde: '2026-10-01' })
    const { error } = await activo.client.rpc('actualizar_documento', {
      p_id: id!,
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
    const { data: factura } = await registrar({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    await registrar({ tipo: 'orden_pago', monto: 600 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 600 }] })

    const cambioTipo = await activo.client.rpc('actualizar_documento', {
      p_id: factura!,
      p_datos: { tipo: 'remito', notas: MARCA },
      p_presupuestos: [presupuesto],
    })
    expect(cambioTipo.error?.message).toMatch(/primero quitá/)

    const montoMenor = await activo.client.rpc('actualizar_documento', {
      p_id: factura!,
      p_datos: { tipo: 'factura', monto: 500, tipo_comprobante: 'FA', notas: MARCA },
      p_presupuestos: [presupuesto],
    })
    expect(montoMenor.error?.message).toMatch(/menor a lo ya cobrado/)
  })

  it('agrega páginas y quita archivos, pero siempre queda uno', async () => {
    const { data: id } = await registrar({ tipo: 'remito' })
    const pagina = await subirArchivo(activo.client, ids.cliente_id, 'Página 2.jpg')
    expect((await activo.client.rpc('agregar_archivos', { p_documento_id: id!, p_archivos: [pagina] })).error).toBeNull()

    const archivos = await sql<{ id: string; orden: number }>(
      'select id, orden from public.documento_archivos where documento_id = $1 order by orden',
      [id],
    )
    expect(archivos.map((a) => a.orden)).toEqual([1, 2])
    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[0].id })).error).toBeNull()
    expect((await activo.client.rpc('quitar_archivo', { p_archivo_id: archivos[1].id })).error?.message).toMatch(/al menos un archivo/)
  })

  it('anular y restaurar; una OP no se restaura si ya no hay saldo', async () => {
    const { data: factura } = await registrar({ tipo: 'factura', monto: 1000, tipo_comprobante: 'FA' })
    const { data: op1 } = await registrar(
      { tipo: 'orden_pago', monto: 1000 },
      { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] },
    )

    expect((await activo.client.rpc('anular_documento', { p_id: op1! })).error).toBeNull()
    await registrar({ tipo: 'orden_pago', monto: 1000 }, { aplicaciones: [{ factura_id: factura, monto_aplicado: 1000 }] })
    expect((await activo.client.rpc('restaurar_documento', { p_id: op1! })).error?.message).toMatch(/ya no tiene saldo/)

    const { data: oc } = await registrar({ tipo: 'orden_compra' })
    await activo.client.rpc('anular_documento', { p_id: oc! })
    expect((await activo.client.rpc('restaurar_documento', { p_id: oc! })).error).toBeNull()
  })
})
