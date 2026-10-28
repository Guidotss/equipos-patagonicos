import { Plus, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { FiltrosPresupuestos } from '@/components/presupuestos/filtros-presupuestos'
import { Button } from '@/components/ui/button'
import { Conteo } from '@/components/ui/conteo'
import { Pastilla } from '@/components/ui/pastilla'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatFechaCorta } from '@/lib/format/fechas'
import { formatMoneda } from '@/lib/format/montos'
import { ESTADOS_PRESUPUESTO, hrefPresupuestos, leerFiltrosPresupuestos, POR_PAGINA } from '@/lib/presupuestos/lista'
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
        <FiltrosPresupuestos filtros={filtros} clientes={clientes.data} />
        {busqueda.data.length ? (
          <div className="overflow-hidden rounded-xl border bg-card shadow-tarjeta">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Cliente / Trabajo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">OC / R / F / OP</TableHead>
                    <TableHead className="text-right">Saldo a cobrar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {busqueda.data.map((fila) => (
                    <TableRow key={fila.id}>
                      <TableCell>
                        <Link href={`/presupuestos/${fila.id}`} className="font-medium text-primary hover:underline">
                          {fila.numero}
                        </Link>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {fila.fecha_aprobacion ? formatFechaCorta(fila.fecha_aprobacion) : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <Link href={`/presupuestos/${fila.id}`} className="block font-medium hover:underline">
                          {fila.cliente_razon_social}
                        </Link>
                        <span className="mt-1 block truncate text-sm text-muted-foreground">{fila.asunto}</span>
                      </TableCell>
                      <TableCell>
                        <Pastilla
                          tono={
                            fila.presupuesto_estado === 'en_curso'
                              ? 'info'
                              : fila.presupuesto_estado === 'finalizado'
                                ? 'exito'
                                : 'neutro'
                          }
                        >
                          {ESTADOS_PRESUPUESTO[fila.presupuesto_estado as keyof typeof ESTADOS_PRESUPUESTO] ?? '—'}
                        </Pastilla>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {fila.ordenes_compra} / {fila.remitos} / {fila.facturas} / {fila.ordenes_pago}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoneda(fila.saldo ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col divide-y md:hidden">
              {busqueda.data.map((fila) => (
                <li key={fila.id} className="p-4">
                  <Link href={`/presupuestos/${fila.id}`} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-primary">N° {fila.numero}</span>
                      <Pastilla tono={fila.presupuesto_estado === 'en_curso' ? 'info' : 'neutro'}>
                        {ESTADOS_PRESUPUESTO[fila.presupuesto_estado as keyof typeof ESTADOS_PRESUPUESTO]}
                      </Pastilla>
                    </div>
                    <span className="text-sm font-medium">{fila.cliente_razon_social}</span>
                    <span className="text-sm text-muted-foreground">{fila.asunto}</span>
                    <span className="text-sm">Saldo {formatMoneda(fila.saldo ?? 0)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {paginas > 1 ? (
              <nav
                aria-label="Paginación"
                className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm"
              >
                <p className="text-muted-foreground">
                  Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, total)} de {total}
                </p>
                <div className="flex items-center gap-2">
                  {filtros.pagina > 1 ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={hrefPresupuestos(filtros, filtros.pagina - 1)}>Anterior</Link>
                    </Button>
                  ) : null}
                  <span>
                    Página {filtros.pagina} de {paginas}
                  </span>
                  {filtros.pagina < paginas ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={hrefPresupuestos(filtros, filtros.pagina + 1)}>Siguiente</Link>
                    </Button>
                  ) : null}
                </div>
              </nav>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
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
      </Contenido>
    </>
  )
}
