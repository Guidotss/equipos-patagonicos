import { Plus, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { MarcoListado } from '@/components/listados/marco-listado'
import { PaginacionListado } from '@/components/listados/paginacion-listado'
import { FiltrosPresupuestos } from '@/components/presupuestos/filtros-presupuestos'
import { TablaPresupuestos } from '@/components/presupuestos/tabla-presupuestos'
import { Button } from '@/components/ui/button'
import { Conteo } from '@/components/ui/conteo'
import { hrefPresupuestos, leerFiltrosPresupuestos, POR_PAGINA } from '@/lib/presupuestos/lista'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Presupuestos' }

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtros = leerFiltrosPresupuestos(await searchParams)
  const supabase = await createClient()
  const inicio = (filtros.pagina - 1) * POR_PAGINA
  const [busqueda, clientes] = await Promise.all([
    supabase
      .rpc(
        'buscar_presupuestos',
        { texto: filtros.q, estado: filtros.estado, cliente: filtros.cliente || undefined },
        { count: 'exact' },
      )
      .select('*')
      .order('numero', { ascending: false })
      .range(inicio, inicio + POR_PAGINA - 1),
    supabase.from('clientes').select('id, razon_social').order('razon_social'),
  ])
  if (busqueda.error?.code === 'PGRST103') redirect(hrefPresupuestos(filtros))
  if (busqueda.error) throw busqueda.error
  if (clientes.error) throw clientes.error
  const total = busqueda.count ?? 0
  const paginas = Math.ceil(total / POR_PAGINA)
  if (total > 0 && filtros.pagina > paginas) redirect(hrefPresupuestos(filtros, paginas))
  return (
    <>
      <BarraMigas migas={[{ texto: 'Presupuestos' }]} />
      <Contenido>
        <EncabezadoPagina
          compacto
          titulo="Presupuestos"
          extra={<Conteo>{total}</Conteo>}
          descripcion="Cotizaciones aprobadas y sus documentos comerciales."
          acciones={
            <>
              <Button variant="outline" asChild>
                <Link href="/documentos/nuevo">
                  <Upload data-icon="inline-start" />
                  Subir documento
                </Link>
              </Button>
              <Button asChild>
                <Link href="/cotizaciones/directo">
                  <Plus data-icon="inline-start" />
                  Presupuesto directo
                </Link>
              </Button>
            </>
          }
        />
        <MarcoListado
          herramientas={<FiltrosPresupuestos filtros={filtros} clientes={clientes.data} />}
          pie={<PaginacionListado total={total} pagina={filtros.pagina} tamano={POR_PAGINA} href={(pagina) => hrefPresupuestos(filtros, pagina)} />}
        >
          {busqueda.data.length ? (
            <TablaPresupuestos presupuestos={busqueda.data} />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-muted-foreground">
                No hay presupuestos {filtros.q || filtros.estado || filtros.cliente ? 'con estos filtros.' : 'todavía.'}
              </p>
              <Button variant="link" asChild>
                <Link href={filtros.q || filtros.estado || filtros.cliente ? '/presupuestos' : '/cotizaciones/directo'}>
                  {filtros.q || filtros.estado || filtros.cliente ? 'Limpiar filtros' : 'Crear presupuesto directo'}
                </Link>
              </Button>
            </div>
          )}
        </MarcoListado>
      </Contenido>
    </>
  )
}
