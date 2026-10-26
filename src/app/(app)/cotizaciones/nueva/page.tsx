// src/app/(app)/cotizaciones/nueva/page.tsx
import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { EditorCotizacion } from '@/components/cotizaciones/editor/editor-cotizacion'
import { estadoNuevo } from '@/lib/cotizaciones/editor'
import { firmantePorDefecto } from '@/lib/cotizaciones/editor-pantalla'
import { leerCatalogosEditor, leerUltimoFirmante } from '@/lib/cotizaciones/lecturas-editor'
import { hoyArgentina } from '@/lib/format/fechas'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Nueva cotización' }

export default async function NuevaCotizacionPage() {
  const supabase = await createClient()
  const catalogos = await leerCatalogosEditor(supabase)
  const ultimoFirmante = await leerUltimoFirmante(supabase, catalogos.firmantes)
  const hoy = hoyArgentina()
  const inicial = estadoNuevo({
    plantilla: catalogos.plantillas[0] ?? null,
    firmanteId: firmantePorDefecto(catalogos.firmantes, ultimoFirmante),
    hoy,
  })

  return (
    <>
      <BarraMigas migas={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Nueva' }]} />
      <EditorCotizacion inicial={inicial} catalogos={catalogos} contactos={[]} hoy={hoy} />
    </>
  )
}
