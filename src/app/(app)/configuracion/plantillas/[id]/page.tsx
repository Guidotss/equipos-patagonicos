import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
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
    <>
      <BarraMigas
        migas={[
          { texto: 'Configuración', href: '/configuracion' },
          { texto: 'Plantillas', href: '/configuracion/plantillas' },
          { texto: plantilla.nombre },
        ]}
      />
      <Contenido className="max-w-5xl">
        <EncabezadoPagina
          titulo={plantilla.nombre}
          extra={
            <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-[13px] text-foreground/80">
              {FORMATOS[plantilla.formato as Formato] ?? plantilla.formato}
            </span>
          }
          descripcion={`Validez: ${plantilla.validez_dias} días.`}
        />

        {plantilla.asunto || plantilla.intro ? (
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-tarjeta">
            {plantilla.asunto ? (
              <div className="space-y-1">
                <h2 className="text-[13px] text-muted-foreground">Asunto</h2>
                <p className="whitespace-pre-wrap">{plantilla.asunto}</p>
              </div>
            ) : null}
            {plantilla.intro ? (
              <div className="space-y-1">
                <h2 className="text-[13px] text-muted-foreground">Introducción</h2>
                <p className="whitespace-pre-wrap">{plantilla.intro}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Ítems precargados</h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-tarjeta">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 pl-5 text-muted-foreground">Sección</TableHead>
                  <TableHead className="h-11 text-muted-foreground">Descripción</TableHead>
                  <TableHead className="h-11 text-muted-foreground">Unidad</TableHead>
                  <TableHead className="h-11 pr-5 text-right text-muted-foreground">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, indice) => (
                  <TableRow key={indice}>
                    <TableCell className="py-3 pl-5">{item.seccion || '—'}</TableCell>
                    <TableCell className="py-3 whitespace-normal">{item.descripcion}</TableCell>
                    <TableCell className="py-3">{item.unidad}</TableCell>
                    <TableCell className="py-3 pr-5 text-right tabular-nums">{item.cantidad}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Bloques de texto</h2>
          {bloques.map((bloque, indice) => (
            <article key={indice} className="space-y-1.5 rounded-xl border bg-card p-5 shadow-tarjeta">
              {bloque.titulo ? <h3 className="font-semibold">{bloque.titulo}</h3> : null}
              <p className="text-[15px] whitespace-pre-wrap text-foreground/80">{bloque.contenido}</p>
            </article>
          ))}
        </section>
      </Contenido>
    </>
  )
}
