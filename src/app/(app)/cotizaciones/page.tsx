import { FileText, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { FiltrosCotizaciones } from '@/components/cotizaciones/lista/filtros-cotizaciones'
import { ListaCotizacionesMovil } from '@/components/cotizaciones/lista/lista-cotizaciones-movil'
import { Paginacion } from '@/components/cotizaciones/lista/paginacion'
import { TablaCotizaciones } from '@/components/cotizaciones/lista/tabla-cotizaciones'
import { MarcoListado } from '@/components/listados/marco-listado'
import { Button } from '@/components/ui/button'
import { Conteo } from '@/components/ui/conteo'
import { hrefConFiltros, leerFiltros, POR_PAGINA } from '@/lib/cotizaciones/lista'
import { filaCotizacion, totalPaginas } from '@/lib/cotizaciones/lista-vista'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Cotizaciones' }

/**
 * Solo lo que muestra la lista: sin intro, bloques ni ítems (nunca montos, diseño §5). Del equipo embebido, el nombre
 * para la columna Trabajo ("{equipo} · {ubicación}", resumenCotizacion).
 */
const COLUMNAS =
  'id, numero, origen, fecha, cliente_razon_social, formato, estado, vencida, vence_el, asunto, datos, equipo:equipos(nombre)'

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <FileText className="mb-1 size-6 text-muted-foreground" aria-hidden />
      {children}
    </div>
  )
}

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtros = leerFiltros(await searchParams)
  const inicio = (filtros.pagina - 1) * POR_PAGINA
  const supabase = await createClient()

  const [busqueda, conCotizaciones] = await Promise.all([
    supabase
      .rpc(
        'buscar_cotizaciones',
        {
          texto: filtros.q,
          estado: filtros.estado,
          cliente: filtros.cliente || undefined,
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
        },
        { count: 'exact' },
      )
      .select(COLUMNAS)
      .order('numero', { ascending: false })
      .range(inicio, inicio + POR_PAGINA - 1),
    // Para el filtro: los clientes que tienen alguna cotización (el embebido vacío con !inner solo filtra).
    supabase.from('clientes').select('id, razon_social, cotizaciones!inner()').order('razon_social'),
  ])
  // Una página más allá del total (URL vieja, cotizaciones borradas) responde 416: se vuelve a la primera.
  if (busqueda.error?.code === 'PGRST103') redirect(hrefConFiltros(filtros, { pagina: 1 }))
  if (busqueda.error) throw busqueda.error
  if (conCotizaciones.error) throw conCotizaciones.error

  const total = busqueda.count ?? 0
  const paginas = totalPaginas(total)
  // Justo al final (offset = total) PostgREST no da 416 sino una página vacía: se va a la última.
  if (total > 0 && filtros.pagina > paginas) redirect(hrefConFiltros(filtros, { pagina: paginas }))

  const filas = busqueda.data.map(filaCotizacion)
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.cliente || filtros.desde || filtros.hasta)

  return (
    <>
      <BarraMigas migas={[{ texto: 'Cotizaciones' }]} />
      <Contenido>
        {/* El único heading con "Cotizaciones": tests/e2e/auth.spec.ts lo busca por substring. */}
        <EncabezadoPagina
          titulo="Cotizaciones"
          compacto
          extra={<Conteo>{total}</Conteo>}
          acciones={
            <>
              <Button asChild variant="outline" className="h-10 px-3"><Link href="/cotizaciones/cargar">Cargar existente</Link></Button>
              <Button asChild variant="outline" className="h-10 px-3"><Link href="/cotizaciones/directo">Presupuesto directo</Link></Button>
              <Button asChild className="h-10 px-3.5">
                <Link href="/cotizaciones/nueva">
                  <Plus aria-hidden />
                  Nueva cotización
                </Link>
              </Button>
            </>
          }
        />

        <MarcoListado
          className="group/lista"
          herramientas={<FiltrosCotizaciones filtros={filtros} clientes={conCotizaciones.data} />}
          pie={<Paginacion filtros={filtros} total={total} />}
        >
          <div className="transition-opacity group-has-[[data-pendiente]]/lista:opacity-60">
            {total === 0 && !hayFiltros ? (
              <Vacio>
                <p className="font-medium">Todavía no hay cotizaciones.</p>
                <p className="text-sm text-muted-foreground">Creá la primera con “Nueva cotización”.</p>
                <Button asChild className="mt-2"><Link href="/cotizaciones/nueva"><Plus aria-hidden />Nueva cotización</Link></Button>
              </Vacio>
            ) : total === 0 ? (
              <Vacio>
                <p className="text-muted-foreground">
                  {filtros.q
                    ? `No hay cotizaciones que coincidan con "${filtros.q}".`
                    : 'No hay cotizaciones con estos filtros.'}
                </p>
                <Button asChild variant="link">
                  <Link href="/cotizaciones">Limpiar filtros</Link>
                </Button>
              </Vacio>
            ) : (
              <>
                <div className="hidden @min-[44rem]/listado:block">
                  <TablaCotizaciones filas={filas} />
                </div>
                <div className="@min-[44rem]/listado:hidden">
                  <ListaCotizacionesMovil filas={filas} />
                </div>
              </>
            )}
          </div>
        </MarcoListado>
      </Contenido>
    </>
  )
}
