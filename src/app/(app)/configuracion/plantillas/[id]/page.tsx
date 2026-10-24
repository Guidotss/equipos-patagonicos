import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FORMATOS, leerBloques, leerItemsPlantilla, type Formato } from '@/lib/plantillas/contenido'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Plantilla' }

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: plantilla, error } = await supabase.from('plantillas').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!plantilla) notFound()

  const bloques = leerBloques(plantilla.bloques)
  const items = leerItemsPlantilla(plantilla.items)

  return (
    <section className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link href="/configuracion/plantillas" className="text-sm text-muted-foreground hover:underline">
          ← Plantillas
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{plantilla.nombre}</h1>
          <Badge variant="outline">{FORMATOS[plantilla.formato as Formato] ?? plantilla.formato}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Validez: {plantilla.validez_dias} días.</p>
      </div>

      {plantilla.asunto ? (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Asunto</h2>
          <p className="whitespace-pre-wrap">{plantilla.asunto}</p>
        </div>
      ) : null}
      {plantilla.intro ? (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Introducción</h2>
          <p className="whitespace-pre-wrap">{plantilla.intro}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Ítems precargados</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sección</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, indice) => (
              <TableRow key={indice}>
                <TableCell>{item.seccion || '—'}</TableCell>
                <TableCell>{item.descripcion}</TableCell>
                <TableCell>{item.unidad}</TableCell>
                <TableCell className="text-right tabular-nums">{item.cantidad}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Bloques de texto</h2>
        {bloques.map((bloque, indice) => (
          <article key={indice} className="space-y-1 rounded-md border p-4">
            {bloque.titulo ? <h3 className="font-semibold">{bloque.titulo}</h3> : null}
            <p className="whitespace-pre-wrap text-sm">{bloque.contenido}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
