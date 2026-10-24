// tests/integration/cotizaciones-estados.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Json } from '@/lib/supabase/database.types'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await borrarUsuario(activo.id)
})

async function nueva(items: Json[] = ITEMS_JORNADA): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA },
    p_items: items,
  })
  if (error) throw error
  return data
}

async function estado(id: string) {
  const [fila] = await sql<{ estado: string; fecha_aprobacion: string | null; presupuesto_estado: string | null; pdf_aprobado_path: string | null }>(
    `select estado, to_char(fecha_aprobacion, 'YYYY-MM-DD') as fecha_aprobacion, presupuesto_estado, pdf_aprobado_path
     from public.cotizaciones where id = $1`,
    [id],
  )
  return fila
}

describe('enviar', () => {
  it('pasa a enviada y guarda cada envío con su PDF', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-1.pdf` })).error).toBeNull()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada-2.pdf` })).error).toBeNull()
    expect((await estado(id)).estado).toBe('enviada')
    const envios = await sql('select pdf_path from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envios).toHaveLength(2)
  })

  it('exige ítems, todos con precio, y una ruta de PDF de esa cotización', async () => {
    const sinItems = await nueva([])
    expect((await activo.client.rpc('marcar_enviada', { p_id: sinItems, p_pdf_path: `cotizaciones/${sinItems}/a.pdf` })).error?.message).toMatch(/no tiene ítems/)

    const sinPrecio = await nueva([{ descripcion: 'Jornada', unidad: 'JORNADA' }])
    expect((await activo.client.rpc('marcar_enviada', { p_id: sinPrecio, p_pdf_path: `cotizaciones/${sinPrecio}/a.pdf` })).error?.message).toMatch(/sin precio/)

    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: 'cotizaciones/otra/a.pdf' })).error?.message).toMatch(/Ruta de PDF inválida/)
  })
})

describe('aprobar', () => {
  it('desde enviada: queda congelada, con fecha y presupuesto en curso', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('marcar_enviada', { p_id: id, p_pdf_path: `cotizaciones/${id}/enviada.pdf` })).error).toBeNull()
    const { error } = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_fecha: '2026-10-25',
    })
    expect(error).toBeNull()
    expect(await estado(id)).toEqual({
      estado: 'aprobada',
      fecha_aprobacion: '2026-10-25',
      presupuesto_estado: 'en_curso',
      pdf_aprobado_path: `cotizaciones/${id}/aprobada.pdf`,
    })
  })

  it('la fecha de aprobación no puede ser anterior a la cotización', async () => {
    const id = await nueva()
    const { error } = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_fecha: '2026-10-01',
    })
    expect(error?.message).toMatch(/anterior a la cotización/)
  })

  it('no se aprueba dos veces', async () => {
    const id = await nueva()
    await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf` })
    const { error } = await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/b.pdf` })
    expect(error?.message).toMatch(/Solo se puede aprobar/)
  })
})

describe('rechazar, reabrir y revertir', () => {
  it('rechazar y reabrir vuelve a borrador', async () => {
    const id = await nueva()
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('rechazada')
    expect((await activo.client.rpc('reabrir_cotizacion', { p_id: id })).error).toBeNull()
    expect((await estado(id)).estado).toBe('borrador')
  })

  it('una aprobada no se puede rechazar', async () => {
    const id = await nueva()
    await activo.client.rpc('aprobar_cotizacion', { p_id: id, p_pdf_path: `cotizaciones/${id}/a.pdf` })
    expect((await activo.client.rpc('rechazar_cotizacion', { p_id: id })).error?.message).toMatch(/Solo se puede rechazar/)
  })

  it('revertir la aprobación vuelve a enviada si se había enviado, o a borrador', async () => {
    const enviada = await nueva()
    await activo.client.rpc('marcar_enviada', { p_id: enviada, p_pdf_path: `cotizaciones/${enviada}/e.pdf` })
    await activo.client.rpc('aprobar_cotizacion', { p_id: enviada, p_pdf_path: `cotizaciones/${enviada}/a.pdf` })
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: enviada })).error).toBeNull()
    expect(await estado(enviada)).toEqual({ estado: 'enviada', fecha_aprobacion: null, presupuesto_estado: null, pdf_aprobado_path: null })

    const directa = await nueva()
    expect((await activo.client.rpc('aprobar_cotizacion', { p_id: directa, p_pdf_path: `cotizaciones/${directa}/a.pdf` })).error).toBeNull()
    expect((await activo.client.rpc('revertir_aprobacion', { p_id: directa })).error).toBeNull()
    expect((await estado(directa)).estado).toBe('borrador')
  })
})
