import { Plus, Search, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { TablaClientes } from '@/components/clientes/tabla-clientes'
import { MarcoListado } from '@/components/listados/marco-listado'
import { PaginacionListado } from '@/components/listados/paginacion-listado'
import { Button } from '@/components/ui/button'
import { Conteo } from '@/components/ui/conteo'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Clientes' }

const TAMANO_PAGINA = 25
const LIMITE_CLIENTES = 200

function hrefClientes(q: string, pagina = 1) {
  const parametros = new URLSearchParams()
  if (q) parametros.set('q', q)
  if (pagina > 1) parametros.set('pagina', String(pagina))
  return `/clientes${parametros.size ? `?${parametros.toString()}` : ''}`
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const parametros = await searchParams
  const q = (Array.isArray(parametros.q) ? parametros.q[0] : parametros.q) ?? ''
  const numeroPagina = Array.isArray(parametros.pagina) ? parametros.pagina[0] : parametros.pagina
  const pagina = numeroPagina && /^[1-9]\d{0,4}$/.test(numeroPagina) ? Number(numeroPagina) : 1
  const supabase = await createClient()
  const { data: clientes, error } = await supabase.rpc('buscar_clientes', { texto: q, limite: LIMITE_CLIENTES })
  if (error) throw error
  const paginas = Math.max(1, Math.ceil(clientes.length / TAMANO_PAGINA))
  if (pagina > paginas) redirect(hrefClientes(q, paginas))
  const inicio = (pagina - 1) * TAMANO_PAGINA
  const clientesPagina = clientes.slice(inicio, inicio + TAMANO_PAGINA)

  return (
    <>
      <BarraMigas migas={[{ texto: 'Clientes' }]} />
      <Contenido>
        <EncabezadoPagina
          compacto
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

        <MarcoListado
          herramientas={
            <form action="/clientes" method="get" role="search" className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1 basis-64 @min-[44rem]/listado:max-w-lg">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="Razón social, CUIT o contacto"
                  aria-label="Buscar clientes"
                  className="h-10 bg-background pl-9"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10">Buscar</Button>
              {q ? (
                <Link href="/clientes" className="inline-flex min-h-10 items-center text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11">
                  Limpiar búsqueda
                </Link>
              ) : null}
            </form>
          }
          pie={
            <>
              {clientes.length === LIMITE_CLIENTES ? (
                <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                  Se muestran hasta 200 coincidencias. Acotá la búsqueda para encontrar un cliente.
                </p>
              ) : null}
              <PaginacionListado
                total={clientes.length}
                pagina={pagina}
                tamano={TAMANO_PAGINA}
                href={(numero) => hrefClientes(q, numero)}
              />
            </>
          }
        >
          {clientes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <Users className="size-6 text-muted-foreground" aria-hidden />
              <p className="max-w-md break-words text-muted-foreground">
                {q ? `No hay clientes que coincidan con “${q}”.` : 'Todavía no hay clientes cargados.'}
              </p>
              <Button asChild variant="link">
                <Link href={q ? '/clientes' : '/clientes/nuevo'}>{q ? 'Limpiar búsqueda' : 'Crear primer cliente'}</Link>
              </Button>
            </div>
          ) : (
            <TablaClientes clientes={clientesPagina} />
          )}
        </MarcoListado>
      </Contenido>
    </>
  )
}
