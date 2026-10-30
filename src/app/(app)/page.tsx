import type { Metadata } from 'next'
import { Plus, Upload } from 'lucide-react'
import Link from 'next/link'
import { BarraMigas, Contenido, Portada } from '@/components/app-shell/encabezado'
import { ColaInicio } from '@/components/inicio/cola-inicio'
import { Button } from '@/components/ui/button'
import { hoyArgentina, ZONA_ARGENTINA } from '@/lib/format/fechas'
import { leerInicio, PENDIENTES_POR_PAGINA } from '@/lib/inicio/lecturas'
import { COLAS_INICIO, esColaInicio, paginaValida, type ColaInicio as NombreColaInicio } from '@/lib/inicio/modelo'

export const metadata: Metadata = { title: 'Inicio' }

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ cola?: string; pagina?: string }> }) {
  const parametros = await searchParams
  // El layout valida la sesión en paralelo; las consultas de Inicio también están protegidas por RLS.
  const cola = esColaInicio(parametros.cola) ? parametros.cola : undefined
  const pagina = paginaValida(parametros.pagina)
  const { resumen, pendientes } = await leerInicio(cola, pagina)
  const ahora = new Date()
  const hoy = hoyArgentina(ahora)
  const fecha = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA_ARGENTINA,
  }).format(ahora)
  const total = resumen.find((fila) => fila.cola === cola)?.cantidad ?? 0
  const paginas = Math.max(1, Math.ceil(total / PENDIENTES_POR_PAGINA))
  return (
    <>
      <BarraMigas migas={cola ? [{ texto: 'Inicio', href: '/' }, { texto: COLAS_INICIO[cola].titulo }] : [{ texto: 'Inicio' }]} />
      <Portada className="h-auto min-h-30">
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
      </Portada>
      <Contenido>
        {cola ? (
          <>
            <Button variant="outline" asChild><Link href="/">Volver a todas las colas</Link></Button>
            <ColaInicio cola={cola} resumen={resumen.find((fila) => fila.cola === cola)} filas={pendientes} hoy={hoy} completa />
            {paginas > 1 || pagina > 1 ? (
              <nav aria-label="Paginación de pendientes" className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-muted-foreground">{total} pendientes · Página {pagina} de {paginas}</p>
                <div className="flex gap-2">
                  {pagina > 1 ? <Button variant="outline" asChild><Link href={`/?cola=${cola}&pagina=${Math.min(pagina - 1, paginas)}`}>Anterior</Link></Button> : null}
                  {pagina < paginas ? <Button variant="outline" asChild><Link href={`/?cola=${cola}&pagina=${pagina + 1}`}>Siguiente</Link></Button> : null}
                </div>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(COLAS_INICIO) as NombreColaInicio[]).map((nombre) => (
              <ColaInicio key={nombre} cola={nombre} resumen={resumen.find((fila) => fila.cola === nombre)}
                filas={pendientes.filter((fila) => fila.cola === nombre)} hoy={hoy}
                className={nombre === 'cobranzas' ? 'md:col-span-2' : undefined} />
            ))}
          </div>
        )}
      </Contenido>
    </>
  )
}
