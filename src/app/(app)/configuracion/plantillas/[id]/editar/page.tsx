import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { EditorPlantilla } from '@/components/configuracion/editor-plantilla'
import { estadoNuevo } from '@/lib/cotizaciones/editor'
import { hoyArgentina } from '@/lib/format/fechas'
import { leerBloques, leerItemsPlantilla, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export default async function EditarPlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()
  const supabase = await createClient()
  const { data, error } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) notFound()
  const plantilla = { ...data, formato: data.formato as Formato, items: leerItemsPlantilla(data.items), bloques: leerBloques(data.bloques) }
  const inicial = estadoNuevo({ plantilla, firmanteId: '', hoy: hoyArgentina() })
  return <><BarraMigas migas={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Plantillas', href: '/configuracion/plantillas' }, { texto: 'Editar contenido' }]} /><EditorPlantilla id={id} nombre={data.nombre} inicial={inicial} plantilla={plantilla} /></>
}
