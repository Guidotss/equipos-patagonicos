import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { rangoPages } from '@/lib/quotes/list'

export function PaginationListing({ total, pagina, tamano = 25, href }: {
  total: number
  pagina: number
  tamano?: number
  href: (pagina: number) => string
}) {
  if (total === 0) return null
  const pages = Math.max(1, Math.ceil(total / tamano))
  const actual = Math.min(Math.max(1, pagina), pages)
  const desde = (actual - 1) * tamano + 1
  const hasta = Math.min(actual * tamano, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground">Mostrando <span className="font-medium text-foreground tabular-nums">{desde}–{hasta}</span> de <span className="font-medium text-foreground tabular-nums">{total}</span></p>
      {pages > 1 ? (
        <nav aria-label="Paginación" className="flex w-full items-center justify-between gap-1 sm:w-auto">
          {actual > 1 ? <Button asChild variant="outline" className="h-9"><Link href={href(actual - 1)}><ChevronLeft aria-hidden />Anterior</Link></Button> : <Button variant="outline" className="h-9" disabled><ChevronLeft aria-hidden />Anterior</Button>}
          <ol className="hidden items-center gap-1 sm:flex">
            {rangoPages(actual, pages).map((numero, index) => <li key={`${numero}-${index}`}>
              {numero === '…' ? <span aria-hidden className="px-2">…</span> : numero === actual ? <span aria-current="page" className="grid size-9 place-items-center rounded-lg bg-accent font-medium text-primary tabular-nums">{numero}</span> : <Button asChild variant="ghost" className="h-9 min-w-9"><Link href={href(numero)} aria-label={`Página ${numero}`}>{numero}</Link></Button>}
            </li>)}
          </ol>
          <p className="px-2 text-xs text-muted-foreground sm:hidden">Página {actual} de {pages}</p>
          {actual < pages ? <Button asChild variant="outline" className="h-9"><Link href={href(actual + 1)}>Siguiente<ChevronRight aria-hidden /></Link></Button> : <Button variant="outline" className="h-9" disabled>Siguiente<ChevronRight aria-hidden /></Button>}
        </nav>
      ) : null}
    </div>
  )
}
