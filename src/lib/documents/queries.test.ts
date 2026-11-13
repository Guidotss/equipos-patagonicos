import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { readFinanceByDocument } from '@/lib/finance/queries'
import { contextoDocument } from './queries'

vi.mock('@/lib/finance/queries', async (original) => ({
  ...(await original<typeof import('@/lib/finance/queries')>()),
  readFinanceByDocument: vi.fn(async () => ({})),
}))

function clientWithPages(failDocumentPage = false) {
  const ranges: Record<string, number[]> = {}
  const orders: Record<string, string[]> = {}
  const rows: Record<string, object[]> = {
    cotizaciones: Array.from({ length: 1001 }, (_, index) => ({
      id: `budget-${index}`,
      numero: index,
      cliente_id: 'client',
      asunto: '',
      presupuesto_estado: 'en_curso',
      equipo_id: null,
      cliente: { razon_social: 'Cliente' },
    })),
    documentos: Array.from({ length: 1001 }, (_, index) => ({
      id: `document-${index}`,
      equipo_id: null,
      tipo: index % 2 === 0 ? 'factura' : 'remito',
      documento_presupuestos: [{ cotizacion_id: `budget-${index}` }],
    })),
    v_facturas: Array.from({ length: 1001 }, (_, index) => ({
      id: `invoice-${index}`,
    })),
    equipos: [
      ...Array.from({ length: 501 }, (_, index) => ({
        id: `equipment-${index}`,
        nombre: `Grúa ${index}`,
        activo: true,
      })),
      { id: 'historical', nombre: 'Grúa anterior', activo: false },
    ],
  }
  const client = {
    from(table: string) {
      let selected = rows[table]
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          if (table === 'equipos' && column === 'activo')
            selected = selected.filter(
              (row) => (row as { activo: boolean }).activo === value,
            )
          return query
        },
        order(column: string) {
          ;(orders[table] ??= []).push(column)
          return query
        },
        range(from: number, to: number) {
          ;(ranges[table] ??= []).push(from)
          if (table === 'documentos' && from === 500 && failDocumentPage) {
            return Promise.resolve({
              data: null,
              error: new Error('Lectura interrumpida'),
            })
          }
          return Promise.resolve({
            data: selected.slice(from, to + 1),
            error: null,
          })
        },
      }
      return query
    },
  } as unknown as SupabaseClient<Database>
  return { client, ranges, orders }
}

describe('contexto documental completo', () => {
  beforeEach(() => vi.mocked(readFinanceByDocument).mockClear())

  it('pagina presupuestos, documentos y facturas antes de leer sus finanzas', async () => {
    const { client, ranges, orders } = clientWithPages()
    const context = await contextoDocument(client, 'client')
    expect(context.budgets).toHaveLength(1001)
    expect(context.documentos).toHaveLength(1001)
    expect(context.facturas).toHaveLength(1001)
    expect(context.invoiceBudgetIds['document-1000']).toEqual(['budget-1000'])
    expect(context.invoiceBudgetIds).not.toHaveProperty('document-999')
    expect(ranges).toEqual({
      cotizaciones: [0, 500, 1000],
      documentos: [0, 500, 1000],
      v_facturas: [0, 500, 1000],
      equipos: [0, 500],
    })
    expect(context.equipos).toHaveLength(502)
    expect(orders.documentos).toEqual([
      'created_at',
      'id',
      'created_at',
      'id',
      'created_at',
      'id',
    ])
    expect(orders.cotizaciones).toEqual([
      'numero',
      'id',
      'numero',
      'id',
      'numero',
      'id',
    ])
    expect(orders.v_facturas).toEqual([
      'fecha_vencimiento',
      'id',
      'fecha_vencimiento',
      'id',
      'fecha_vencimiento',
      'id',
    ])
    expect(vi.mocked(readFinanceByDocument).mock.calls[0][1]).toHaveLength(501)
    expect(context.financeByDocument['document-1']).toEqual({
      invoiceAllocations: [],
      paymentInstruments: [],
      paymentAllocations: [],
    })
  })

  it('incluye también grúas inactivas sin vínculo previo para atribución explícita', async () => {
    const { client } = clientWithPages()
    const context = await contextoDocument(client, 'client')
    expect(context.equipos).toHaveLength(502)
    expect(
      context.equipos.filter((equipment) => equipment.id === 'equipment-0'),
    ).toHaveLength(1)
    expect(context.equipos).toContainEqual(
      expect.objectContaining({ id: 'historical', activo: false }),
    )
  })

  it('rechaza un error intermedio sin devolver opciones ni iniciar la lectura financiera', async () => {
    const { client } = clientWithPages(true)
    await expect(contextoDocument(client, 'client')).rejects.toThrow(
      'Lectura interrumpida',
    )
    expect(readFinanceByDocument).not.toHaveBeenCalled()
  })
})
