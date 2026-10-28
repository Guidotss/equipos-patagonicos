import type { Metadata } from 'next'
import Link from 'next/link'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { FormularioBusquedaGlobal } from '@/components/app-shell/buscador-global'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Conteo } from '@/components/ui/conteo'
import { requireUsuario } from '@/lib/auth'
import { buscarGlobal, RESULTADOS_POR_PAGINA } from '@/lib/busqueda/lecturas'
import { esquemaBusqueda, esGrupoBusqueda, GRUPOS_BUSQUEDA, hrefBusqueda, type GrupoBusqueda } from '@/lib/busqueda/modelo'
import { paginaValida } from '@/lib/inicio/modelo'

export const metadata: Metadata = { title: 'Buscar' }

export default async function BuscarPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; grupo?: string; pagina?: string }>
}) {
  const parametros = await searchParams
  await requireUsuario()
  const q = typeof parametros.q === 'string' ? parametros.q : ''
  const consulta = esquemaBusqueda.safeParse(q)
  const grupo = esGrupoBusqueda(parametros.grupo) ? parametros.grupo : undefined
  const pagina = paginaValida(parametros.pagina)
  const resultados = consulta.success ? await buscarGlobal(consulta.data, grupo, pagina) : []
  const grupos = grupo ? [grupo] : Object.keys(GRUPOS_BUSQUEDA) as GrupoBusqueda[]
  const cantidad = resultados[0]?.cantidad ?? 0
  const paginas = Math.max(1, Math.ceil(cantidad / RESULTADOS_POR_PAGINA))

  return (
    <>
      <BarraMigas migas={[{ texto: 'Inicio', href: '/' }, { texto: 'Buscar' }]} />
      <Contenido>
        <EncabezadoPagina titulo="Buscar" descripcion="Encontrá clientes, cotizaciones, órdenes de compra, remitos, facturas y órdenes de pago." />
        <div className="max-w-2xl"><FormularioBusquedaGlobal valor={q} /></div>
        {!consulta.success ? (
          <Alert variant="destructive"><AlertDescription>{consulta.error.issues[0].message}</AlertDescription></Alert>
        ) : !consulta.data ? (
          <p className="text-muted-foreground">Escribí una razón social, un CUIT o un número para comenzar.</p>
        ) : resultados.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground">No hay resultados para “{consulta.data}”{grupo ? ` en ${GRUPOS_BUSQUEDA[grupo].toLowerCase()}` : ''}.</p>
            {grupo ? <Button variant="outline" asChild><Link href={hrefBusqueda(q)}>Buscar en todos los grupos</Link></Button> : null}
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {grupos.map((nombre) => {
              const filas = resultados.filter((fila) => fila.grupo === nombre)
              if (!filas.length) return null
              return (
                <section key={nombre} aria-labelledby={`resultados-${nombre}`}>
                  <Card>
                    <CardHeader className="border-b">
                      <CardTitle><h2 id={`resultados-${nombre}`}>{GRUPOS_BUSQUEDA[nombre]}</h2></CardTitle>
                      <CardAction><Conteo>{filas[0].cantidad}</Conteo></CardAction>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex flex-col divide-y">
                        {filas.map((fila) => (
                          <li key={fila.id} className="py-3 first:pt-0 last:pb-0">
                            <Link href={fila.href} className="flex flex-col gap-1 hover:text-primary">
                              <span className="font-medium">{nombre === 'clientes' ? fila.cliente_razon_social : fila.numero || 'Sin número'}</span>
                              {nombre !== 'clientes' ? <span className="text-sm">{fila.cliente_razon_social}</span> : fila.numero ? <span className="text-sm text-muted-foreground">CUIT {fila.numero}</span> : null}
                              {fila.descripcion ? <span className="text-xs text-muted-foreground">{fila.descripcion}</span> : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    {!grupo && filas[0].cantidad > filas.length ? (
                      <CardFooter><Button variant="ghost" size="sm" asChild><Link href={hrefBusqueda(q, nombre)}>Ver los {filas[0].cantidad} resultados</Link></Button></CardFooter>
                    ) : null}
                  </Card>
                </section>
              )
            })}
          </div>
        )}
        {grupo ? (
          <nav aria-label="Paginación de búsqueda" className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href={hrefBusqueda(q)} className="text-primary hover:underline">Todos los grupos</Link>
            <div className="flex items-center gap-3">
              {pagina > 1 ? <Button variant="outline" asChild><Link href={hrefBusqueda(q, grupo, pagina - 1)}>Anterior</Link></Button> : null}
              {resultados.length > 0 ? <span>Página {pagina} de {paginas}</span> : null}
              {pagina < paginas ? <Button variant="outline" asChild><Link href={hrefBusqueda(q, grupo, pagina + 1)}>Siguiente</Link></Button> : null}
            </div>
          </nav>
        ) : null}
      </Contenido>
    </>
  )
}
