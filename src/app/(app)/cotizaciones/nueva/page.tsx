// src/app/(app)/cotizaciones/nueva/page.tsx
import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { EditorCotizacion } from '@/components/cotizaciones/editor/editor-cotizacion'
import { estadoNuevo } from '@/lib/cotizaciones/editor'
import { firmantePorDefecto } from '@/lib/cotizaciones/editor-pantalla'
import { leerCatalogosEditor, leerUltimoFirmante, leerContactos } from '@/lib/cotizaciones/lecturas-editor'
import { hoyArgentina } from '@/lib/format/fechas'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Nueva cotización' }

export default async function NuevaCotizacionPage({ searchParams }: { searchParams: Promise<{ cliente?: string; plantilla?: string }> }) {
  const parametros = await searchParams
  const supabase = await createClient()
  const catalogos = await leerCatalogosEditor(supabase)
  const ultimoFirmante = await leerUltimoFirmante(supabase, catalogos.firmantes)
  const hoy = hoyArgentina()
  const inicial = estadoNuevo({
    plantilla: catalogos.plantillas.find((p) => p.id === parametros.plantilla) ?? catalogos.plantillas[0] ?? null,
    firmanteId: firmantePorDefecto(catalogos.firmantes, ultimoFirmante),
    hoy,
  })
  if (parametros.cliente && esUuid(parametros.cliente)) {
    const { data, error } = await supabase.from('clientes').select('id,razon_social,cuit').eq('id', parametros.cliente).maybeSingle()
    if (error) throw error
    inicial.cliente = data
  }
  const contactos = inicial.cliente ? await leerContactos(supabase, inicial.cliente.id) : []

  return (
    <>
      <BarraMigas migas={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Nueva' }]} />
      <EditorCotizacion inicial={inicial} catalogos={catalogos} contactos={contactos} hoy={hoy} />
    </>
  )
}
