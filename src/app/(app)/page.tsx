import type { Metadata } from 'next'
import { Plus, Upload } from 'lucide-react'
import Link from 'next/link'
import { BarCrumbs, Content, Cover } from '@/components/app-shell/header'
import { QueueHome } from '@/components/home/queue-home'
import { Button } from '@/components/ui/button'
import { todayArgentina, ZONA_ARGENTINA } from '@/lib/format/dates'
import { readHome, PENDING_PER_PAGE } from '@/lib/home/queries'
import { QUEUES_HOME, isQueueHome, pageValid, type QueueHome as NameQueueHome } from '@/lib/home/model'

export const metadata: Metadata = { title: 'Inicio' }

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cola?: string; pagina?: string }> }) {
  const params = await searchParams
  // El layout valida la sesión en paralelo; las consultas de Inicio también están protegidas por RLS.
  const cola = isQueueHome(params.cola) ? params.cola : undefined
  const pagina = pageValid(params.pagina)
  const { resumen, pendingList } = await readHome(cola, pagina)
  const now = new Date()
  const today = todayArgentina(now)
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA_ARGENTINA,
  }).format(now)
  const total = resumen.find((row) => row.cola === cola)?.cantidad ?? 0
  const pages = Math.max(1, Math.ceil(total / PENDING_PER_PAGE))
  return (
    <>
      <BarCrumbs crumbs={cola ? [{ texto: 'Inicio', href: '/' }, { texto: QUEUES_HOME[cola].titulo }] : [{ texto: 'Inicio' }]} />
      <Cover className="h-auto min-h-30">
        <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-9">
          <div className="flex flex-col gap-1 text-primary-foreground">
            <h1 className="text-3xl font-semibold tracking-tight">Inicio</h1>
            <p className="text-sm first-letter:uppercase">{fecha}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" asChild><Link href="/documentos/nuevo"><Upload data-icon="inline-start" aria-hidden />Subir documento</Link></Button>
            <Button variant="secondary" asChild><Link href="/cotizaciones/nueva"><Plus data-icon="inline-start" aria-hidden />Nueva cotización</Link></Button>
          </div>
        </header>
      </Cover>
      <Content>
        {cola ? (
          <>
            <Button variant="outline" asChild><Link href="/">Volver a todas las colas</Link></Button>
            <QueueHome cola={cola} resumen={resumen.find((row) => row.cola === cola)} rows={pendingList} today={today} complete />
            {pages > 1 || pagina > 1 ? (
              <nav aria-label="Paginación de pendientes" className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-muted-foreground">{total} pendientes · Página {pagina} de {pages}</p>
                <div className="flex gap-2">
                  {pagina > 1 ? <Button variant="outline" asChild><Link href={`/?cola=${cola}&pagina=${Math.min(pagina - 1, pages)}`}>Anterior</Link></Button> : null}
                  {pagina < pages ? <Button variant="outline" asChild><Link href={`/?cola=${cola}&pagina=${pagina + 1}`}>Siguiente</Link></Button> : null}
                </div>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(QUEUES_HOME) as NameQueueHome[]).map((nombre) => (
              <QueueHome key={nombre} cola={nombre} resumen={resumen.find((row) => row.cola === nombre)}
                rows={pendingList.filter((row) => row.cola === nombre)} today={today}
                className={nombre === 'cobranzas' ? 'md:col-span-2' : undefined} />
            ))}
          </div>
        )}
      </Content>
    </>
  )
}
