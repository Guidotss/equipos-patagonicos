// src/app/(app)/cotizaciones/[id]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { CotizacionSoloLectura } from '@/components/cotizaciones/cotizacion-solo-lectura'
import { EditorCotizacion } from '@/components/cotizaciones/editor/editor-cotizacion'
import { accionDesdeParametro } from '@/lib/cotizaciones/acciones-estado'
import { leerContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import { SELECT_EDITOR, estadoDesdeFila } from '@/lib/cotizaciones/editor'
import { leerCatalogosEditor, leerContactos } from '@/lib/cotizaciones/lecturas-editor'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Cotización' }

/** FilaEditor (Task 3) más el id del cliente, para leer sus contactos. */
const COLUMNAS = `${SELECT_EDITOR}, cliente_id` as const

export default async function CotizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: fila, error } = await supabase.from('cotizaciones').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!fila) notFound()

  const migas = [{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: `N° ${fila.numero}` }]

  if (fila.origen !== 'app') {
    const hoy = hoyArgentina()
    return (
      <>
        <BarraMigas migas={migas} />
        <CotizacionSoloLectura
          cotizacion={{
            id: fila.id,
            numero: fila.numero,
            origen: fila.origen === 'directa' ? 'directa' : 'importada',
            estado: fila.estado,
            // Como v_cotizaciones: el día del vencimiento todavía no cuenta.
            vencida: fila.estado === 'enviada' && sumarDias(fila.fecha, fila.validez_dias) < hoy,
            fecha: fila.fecha,
            cliente: fila.cliente.razon_social,
            asunto: fila.asunto,
            tienePdf: fila.archivo_original_path !== null,
          }}
        />
      </>
    )
  }

  const [catalogos, contactos, contexto] = await Promise.all([
    leerCatalogosEditor(supabase, {
      plantillaId: fila.plantilla_id,
      equipoId: fila.equipo_id,
      firmanteId: fila.firmante_id,
    }),
    leerContactos(supabase, fila.cliente_id),
    leerContextoEstado(supabase, id),
  ])
  if (!contexto) notFound()
  const inicial = estadoDesdeFila(fila)

  return (
    <>
      <BarraMigas migas={migas} />
      <EditorCotizacion
        inicial={inicial}
        catalogos={catalogos}
        contactos={contactos}
        hoy={hoyArgentina()}
        contexto={contexto}
        accionInicial={accionDesdeParametro((await searchParams).accion)}
      />
    </>
  )
}
