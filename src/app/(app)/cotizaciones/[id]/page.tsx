// src/app/(app)/cotizaciones/[id]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BarCrumbs, Content } from '@/components/app-shell/header'
import { Button } from '@/components/ui/button'
import { FollowUp } from '@/components/quotes/specials/follow-up'
import { ActionsSpecials } from '@/components/quotes/specials/actions-specials'
import { QuoteSoloQuery } from '@/components/quotes/quote-read-only'
import { EditorQuote } from '@/components/quotes/editor/editor-quote'
import { actionFromParam } from '@/lib/quotes/actions-status'
import { readContextoStatus } from '@/lib/quotes/context-status'
import { SELECT_EDITOR } from '@/lib/quotes/editor/constants'
import { statusFromRow } from '@/lib/quotes/editor/state'
import { readCatalogsEditor, readContacts } from '@/lib/quotes/queries-editor'
import { todayArgentina, sumarDays } from '@/lib/format/dates'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/validation'

export const metadata: Metadata = { title: 'Cotización' }

/** FilaEditor (Task 3) más el id del cliente, para leer sus contactos. */
const COLUMNAS = `${SELECT_EDITOR}, cliente_id, notas` as const

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const { data: row, error } = await supabase.from('cotizaciones').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!row) notFound()

  const crumbs = [{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: `N° ${row.numero}` }]
  const actionInitial = actionFromParam((await searchParams).accion)

  if (row.origen !== 'app') {
    const today = todayArgentina()
    return (
      <>
        <BarCrumbs crumbs={crumbs} />
        <QuoteSoloQuery
          cotizacion={{
            id: row.id,
            numero: row.numero,
            origen: row.origen === 'directa' ? 'directa' : 'importada',
            estado: row.estado,
            // Como v_cotizaciones: el día del vencimiento todavía no cuenta.
            vencida: row.estado === 'enviada' && sumarDays(row.fecha, row.validez_dias) < today,
            fecha: row.fecha,
            cliente: row.cliente.razon_social,
            asunto: row.asunto,
            tienePdf: row.archivo_original_path !== null,
          }}
        />
        <Content className="max-w-5xl pt-0">
          <ActionsSpecials id={row.id} version={row.updated_at} estado={row.estado} origen={row.origen} today={today} actionInitial={actionInitial} />
          {row.estado === 'aprobada' ? <Button asChild><Link href={`/presupuestos/${id}`}>Abrir presupuesto</Link></Button> : null}
          {row.estado === 'enviada' ? <Button asChild variant="outline"><Link href={`/documentos/nuevo?cotizacion=${id}&tipo=orden_compra`}>Aprobar y cargar orden de compra</Link></Button> : null}
          <FollowUp key={row.updated_at} id={id} version={row.updated_at} notas={row.notas} fecha={row.fecha_proxima_actualizacion} />
        </Content>
      </>
    )
  }

  const [catalogs, contactos, contexto] = await Promise.all([
    readCatalogsEditor(supabase, {
      templateId: row.plantilla_id,
      equipoId: row.equipo_id,
      firmanteId: row.firmante_id,
    }),
    readContacts(supabase, row.cliente_id),
    readContextoStatus(supabase, id),
  ])
  if (!contexto) notFound()
  const initial = statusFromRow(row)

  return (
    <>
      <BarCrumbs crumbs={crumbs} />
      <EditorQuote
        initial={initial}
        catalogs={catalogs}
        contactos={contactos}
        today={todayArgentina()}
        contexto={contexto}
        actionInitial={actionInitial}
      />
      {row.estado === 'aprobada' || row.estado === 'rechazada' ? <Content className="max-w-5xl pt-0">
        {row.estado === 'aprobada' ? <Button asChild><Link href={`/presupuestos/${id}`}>Abrir presupuesto y documentos</Link></Button> : null}
        {row.estado === 'aprobada' || row.estado === 'rechazada' ? <FollowUp key={row.updated_at} id={id} version={row.updated_at} notas={row.notas} fecha={row.fecha_proxima_actualizacion} /> : null}
      </Content> : null}
    </>
  )
}
