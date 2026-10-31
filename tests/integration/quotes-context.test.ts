// tests/integration/cotizaciones-contexto.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readContextoStatus } from '@/lib/quotes/context-status'
import { approveQuote, sendQuote } from '@/lib/quotes/service'
import { ITEMS_DAILY, idsOfExample } from './quotes-helpers'
import { adminClient, removeUser, crearUser, sql } from './helpers'

let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
const creadas: string[] = []

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
})

afterAll(async () => {
  const archivos = await sql<{ name: string }>(
    `select name from storage.objects where bucket_id = 'documentos' and split_part(name, '/', 2) = any($1::text[])`,
    [creadas],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
  await sql('delete from public.cotizaciones where id = any($1::uuid[])', [creadas])
  await removeUser(activo.id)
})

/** Un borrador completo (se puede enviar y aprobar) del 22/10/2026 con 30 días de validez. */
async function nueva(): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      fecha: '2026-10-22',
      asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
      intro: 'Servicios de izaje en {{ubicacion}}.',
      datos: { ubicacion: 'Loma Campana, Añelo' },
      bloques: [{ titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.' }],
    },
    p_items: ITEMS_DAILY,
  })
  if (error) throw error
  creadas.push(data)
  return data
}

describe('leerContextoEstado', () => {
  it('una cotización inexistente da null', async () => {
    expect(await readContextoStatus(activo.client, crypto.randomUUID())).toBeNull()
  })

  it('un borrador recién creado no tiene envíos, aprobación ni anterior', async () => {
    const id = await nueva()
    expect(await readContextoStatus(activo.client, id)).toEqual({
      envios: [],
      vencida: false,
      venceEl: '2026-11-21',
      dateApproval: null,
      anterior: null,
    })
  })

  it('lista los envíos del más reciente al más viejo', async () => {
    const id = await nueva()
    const first = await sendQuote(activo.client, id)
    const segundo = await sendQuote(activo.client, id)

    const contexto = await readContextoStatus(activo.client, id)
    expect(contexto?.envios.map((envio) => envio.id)).toEqual([segundo.envioId, first.envioId])
    expect(contexto?.vencida).toBe(false)
  })

  it('una enviada fuera de validez figura vencida', async () => {
    const id = await nueva()
    await sendQuote(activo.client, id)
    await sql(`update public.cotizaciones set fecha = '2020-01-01', validez_dias = 1 where id = $1`, [id])

    const contexto = await readContextoStatus(activo.client, id)
    expect(contexto?.vencida).toBe(true)
    expect(contexto?.venceEl).toBe('2020-01-02')
  })

  it('una aprobada tiene su fecha y la duplicada conoce a la anterior', async () => {
    const id = await nueva()
    await approveQuote(activo.client, id, '2026-10-23')
    expect((await readContextoStatus(activo.client, id))?.dateApproval).toBe('2026-10-23')

    const { data: copy, error } = await activo.client.rpc('duplicar_cotizacion', { p_id: id })
    if (error) throw error
    creadas.push(copy)
    const [{ numero }] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [id])

    expect((await readContextoStatus(activo.client, copy))?.anterior).toEqual({ id, numero: Number(numero) })
  })
})
