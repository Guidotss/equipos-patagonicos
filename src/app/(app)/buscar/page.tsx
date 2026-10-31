import type { Metadata } from 'next'
import Link from 'next/link'
import { BarCrumbs, Content, HeaderPage } from '@/components/app-shell/header'
import { FormSearchGlobal } from '@/components/app-shell/search-global'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Count } from '@/components/ui/count'
import { requireUser } from '@/lib/auth'
import { searchGlobal, RESULTS_PER_PAGE } from '@/lib/search/queries'
import { schemaSearch, isGroupSearch, GROUPS_SEARCH, hrefSearch, type GroupSearch } from '@/lib/search/model'
import { pageValid } from '@/lib/home/model'

export const metadata: Metadata = { title: 'Buscar' }

export default async function SearchPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; grupo?: string; pagina?: string }>
}) {
  const params = await searchParams
  await requireUser()
  const q = typeof params.q === 'string' ? params.q : ''
  const consulta = schemaSearch.safeParse(q)
  const grupo = isGroupSearch(params.grupo) ? params.grupo : undefined
  const pagina = pageValid(params.pagina)
  const results = consulta.success ? await searchGlobal(consulta.data, grupo, pagina) : []
  const groups = grupo ? [grupo] : Object.keys(GROUPS_SEARCH) as GroupSearch[]
  const cantidad = results[0]?.cantidad ?? 0
  const pages = Math.max(1, Math.ceil(cantidad / RESULTS_PER_PAGE))

  return (
    <>
      <BarCrumbs crumbs={[{ texto: 'Inicio', href: '/' }, { texto: 'Buscar' }]} />
      <Content>
        <HeaderPage titulo="Buscar" descripcion="Encontrá clientes, cotizaciones, órdenes de compra, remitos, facturas y órdenes de pago." />
        <div className="max-w-2xl"><FormSearchGlobal value={q} /></div>
        {!consulta.success ? (
          <Alert variant="destructive"><AlertDescription>{consulta.error.issues[0].message}</AlertDescription></Alert>
        ) : !consulta.data ? (
          <p className="text-muted-foreground">Escribí una razón social, un CUIT o un número para comenzar.</p>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground">No hay resultados para “{consulta.data}”{grupo ? ` en ${GROUPS_SEARCH[grupo].toLowerCase()}` : ''}.</p>
            {grupo ? <Button variant="outline" asChild><Link href={hrefSearch(q)}>Buscar en todos los grupos</Link></Button> : null}
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {groups.map((nombre) => {
              const rows = results.filter((row) => row.grupo === nombre)
              if (!rows.length) return null
              return (
                <section key={nombre} aria-labelledby={`resultados-${nombre}`}>
                  <Card>
                    <CardHeader className="border-b">
                      <CardTitle><h2 id={`resultados-${nombre}`}>{GROUPS_SEARCH[nombre]}</h2></CardTitle>
                      <CardAction><Count>{rows[0].cantidad}</Count></CardAction>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex flex-col divide-y">
                        {rows.map((row) => (
                          <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                            <Link href={row.href} className="flex flex-col gap-1 hover:text-primary">
                              <span className="font-medium">{nombre === 'clientes' ? row.cliente_razon_social : row.numero || 'Sin número'}</span>
                              {nombre !== 'clientes' ? <span className="text-sm">{row.cliente_razon_social}</span> : row.numero ? <span className="text-sm text-muted-foreground">CUIT {row.numero}</span> : null}
                              {row.descripcion ? <span className="text-xs text-muted-foreground">{row.descripcion}</span> : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    {!grupo && rows[0].cantidad > rows.length ? (
                      <CardFooter><Button variant="ghost" size="sm" asChild><Link href={hrefSearch(q, nombre)}>Ver los {rows[0].cantidad} resultados</Link></Button></CardFooter>
                    ) : null}
                  </Card>
                </section>
              )
            })}
          </div>
        )}
        {grupo ? (
          <nav aria-label="Paginación de búsqueda" className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href={hrefSearch(q)} className="text-primary hover:underline">Todos los grupos</Link>
            <div className="flex items-center gap-3">
              {pagina > 1 ? <Button variant="outline" asChild><Link href={hrefSearch(q, grupo, pagina - 1)}>Anterior</Link></Button> : null}
              {results.length > 0 ? <span>Página {pagina} de {pages}</span> : null}
              {pagina < pages ? <Button variant="outline" asChild><Link href={hrefSearch(q, grupo, pagina + 1)}>Siguiente</Link></Button> : null}
            </div>
          </nav>
        ) : null}
      </Content>
    </>
  )
}
