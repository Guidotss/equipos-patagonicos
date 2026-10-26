import { Plus, Search, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { TablaClientes } from '@/components/clientes/tabla-clientes'
import { Button } from '@/components/ui/button'
import { Conteo } from '@/components/ui/conteo'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const { data: clientes, error } = await supabase.rpc('buscar_clientes', { texto: q, limite: 200 })
  if (error) throw error

  return (
    <>
      <BarraMigas migas={[{ texto: 'Clientes' }]} />
      <Contenido>
        <EncabezadoPagina
          titulo="Clientes"
          extra={<Conteo>{clientes.length}</Conteo>}
          acciones={
            <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
              <Link href="/clientes/nuevo">
                <Plus aria-hidden />
                Nuevo cliente
              </Link>
            </Button>
          }
        />

        <form role="search" className="flex max-w-xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por razón social, CUIT o contacto"
              aria-label="Buscar clientes"
              className="h-9 bg-background pl-9"
            />
          </div>
          <Button type="submit" variant="outline" size="lg">
            Buscar
          </Button>
        </form>

        {clientes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <Users className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground">
              {q ? `No hay clientes que coincidan con "${q}".` : 'Todavía no hay clientes cargados.'}
            </p>
          </div>
        ) : (
          <TablaClientes clientes={clientes} />
        )}
      </Contenido>
    </>
  )
}
