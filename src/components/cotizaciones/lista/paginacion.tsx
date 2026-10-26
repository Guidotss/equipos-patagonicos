import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { hrefConFiltros, rangoPaginas, type FiltrosLista } from '@/lib/cotizaciones/lista'
import { filasMostradas, totalPaginas } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

const BOTON = buttonVariants({ variant: 'ghost', size: 'sm' })

function Extremo({ href, etiqueta }: { href: string | null; etiqueta: 'Anterior' | 'Siguiente' }) {
  const contenido =
    etiqueta === 'Anterior' ? (
      <>
        <ChevronLeft aria-hidden />
        Anterior
      </>
    ) : (
      <>
        Siguiente
        <ChevronRight aria-hidden />
      </>
    )
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(BOTON, 'pointer-events-none text-muted-foreground opacity-60')}>
        {contenido}
      </span>
    )
  }
  return (
    <Link href={href} className={BOTON}>
      {contenido}
    </Link>
  )
}

/** Pie de la tarjeta de la lista: "Mostrando 1–25 de 48" y las páginas. Sin pie cuando hay una sola página. */
export function Paginacion({ filtros, total }: { filtros: FiltrosLista; total: number }) {
  const paginas = totalPaginas(total)
  if (paginas <= 1) return null
  const actual = Math.min(filtros.pagina, paginas)
  const { desde, hasta } = filasMostradas(actual, total)
  const rango = (
    <>
      <span className="font-medium text-foreground tabular-nums">
        {desde}–{hasta}
      </span>{' '}
      de <span className="font-medium text-foreground tabular-nums">{total}</span>
    </>
  )

  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-3 text-sm text-muted-foreground @min-[40rem]:px-5">
      <p className="hidden @min-[40rem]:block">Mostrando {rango}</p>
      <nav aria-label="Paginación" className="flex w-full items-center justify-between gap-1 @min-[40rem]:w-auto">
        <Extremo etiqueta="Anterior" href={actual > 1 ? hrefConFiltros(filtros, { pagina: actual - 1 }) : null} />
        <ol className="hidden items-center gap-1 @min-[40rem]:flex">
          {rangoPaginas(actual, paginas).map((pagina, indice) => (
            <li key={pagina === '…' ? `hueco-${indice}` : pagina}>
              {pagina === '…' ? (
                <span aria-hidden className="px-1.5">
                  …
                </span>
              ) : pagina === actual ? (
                <span aria-current="page" className={cn(BOTON, 'bg-accent text-primary tabular-nums hover:bg-accent')}>
                  {pagina}
                </span>
              ) : (
                <Link
                  href={hrefConFiltros(filtros, { pagina })}
                  aria-label={`Página ${pagina}`}
                  className={cn(BOTON, 'tabular-nums')}
                >
                  {pagina}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <p className="@min-[40rem]:hidden">{rango}</p>
        <Extremo
          etiqueta="Siguiente"
          href={actual < paginas ? hrefConFiltros(filtros, { pagina: actual + 1 }) : null}
        />
      </nav>
    </div>
  )
}
