import { Plus, Search, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { TableClients } from '@/components/clients/table-clients'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'
import { Button } from '@/components/ui/button'
import { Count } from '@/components/ui/count'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Clientes' }

const SIZE_PAGE = 25
const LIMITE_CLIENTS = 200

function hrefClients(q: string, pagina = 1) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (pagina > 1) params.set('pagina', String(pagina))
  return `/clientes${params.size ? `?${params.toString()}` : ''}`
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = (Array.isArray(params.q) ? params.q[0] : params.q) ?? ''
  const numberPage = Array.isArray(params.pagina) ? params.pagina[0] : params.pagina
  const pagina = numberPage && /^[1-9]\d{0,4}$/.test(numberPage) ? Number(numberPage) : 1
  const supabase = await createClient()
  const { data: clientes, error } = await supabase.rpc('buscar_clientes', { texto: q, limite: LIMITE_CLIENTS })
  if (error) throw error
  const pages = Math.max(1, Math.ceil(clientes.length / SIZE_PAGE))
  if (pagina > pages) redirect(hrefClients(q, pages))
  const home = (pagina - 1) * SIZE_PAGE
  const clientsPage = clientes.slice(home, home + SIZE_PAGE)

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Clientes' }]} />
      <Content>
        <HeaderPage
          compact
          titulo="Clientes"
          extra={<Count>{clientes.length}</Count>}
          actions={
            <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
              <Link href="/clientes/nuevo">
                <Plus aria-hidden />
                Nuevo cliente
              </Link>
            </Button>
          }
        />

        <FrameListing
          tools={
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
              {clientes.length === LIMITE_CLIENTS ? (
                <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                  Se muestran hasta 200 coincidencias. Acotá la búsqueda para encontrar un cliente.
                </p>
              ) : null}
              <PaginationListing
                total={clientes.length}
                pagina={pagina}
                tamano={SIZE_PAGE}
                href={(numero) => hrefClients(q, numero)}
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
            <TableClients clientes={clientsPage} />
          )}
        </FrameListing>
      </Content>
    </>
  )
}
