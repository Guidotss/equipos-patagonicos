import Link from 'next/link'
import { cn } from '@/lib/utils'

export type Crumb = { texto: string; href?: string }

/** Barra fina de arriba con el camino hasta la página actual. */
export function BarCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className="z-10 flex h-14 items-center border-b bg-background/90 px-4 backdrop-blur md:sticky md:top-0 md:px-9">
      <nav aria-label="Ubicación" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((crumb, index) => (
            <li
              key={`${index}-${crumb.texto}`}
              className={cn('flex min-w-0 items-center gap-1.5', index === 0 && 'shrink-0')}
            >
              {index > 0 ? <span aria-hidden className="shrink-0">/</span> : null}
              {crumb.href ? (
                <Link href={crumb.href} title={crumb.texto} className="min-w-0 truncate transition-colors hover:text-foreground">
                  {crumb.texto}
                </Link>
              ) : (
                <span aria-current="page" title={crumb.texto} className="min-w-0 truncate text-foreground">
                  {crumb.texto}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  )
}

/** Banda azul con la trama de ganchos de grúa que abre las fichas y las secciones principales. */
export function Cover({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn('relative h-30 overflow-hidden bg-linear-to-r from-cover-from to-cover-to', className)}>
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-3/5 bg-[url(/cover-hooks.svg)] bg-size-[auto_100%] bg-right bg-repeat-x mask-l-from-40%"
      />
      {children ? <div className="relative h-full">{children}</div> : null}
    </div>
  )
}

/** Encabezado de una sección principal: título y bajada en blanco sobre la banda. */
export function HeaderSection({ titulo: title, descripcion }: { titulo: string; descripcion?: string }) {
  return (
    <Cover>
      <div className="flex h-full flex-col justify-center gap-1 px-4 md:px-9">
        <h1 className="text-3xl font-semibold tracking-tight text-white md:text-[2rem]">{title}</h1>
        {descripcion ? <p className="text-white/80 md:text-lg">{descripcion}</p> : null}
      </div>
    </Cover>
  )
}

/**
 * Encabezado de una ficha (cliente, presupuesto…): banda, recuadro superpuesto con la inicial o un ícono,
 * título con su estado, datos clave y acciones.
 */
export function HeaderFicha({
  titulo: title,
  recuadro,
  estado,
  datos,
  actions,
}: {
  titulo: string
  recuadro: React.ReactNode
  estado?: React.ReactNode
  datos?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header>
      <Cover />
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 md:px-9">
        <div
          aria-hidden
          className="relative -mt-7 grid size-24 shrink-0 place-items-center rounded-2xl bg-[oklch(0.961_0.01_247.9)] text-5xl font-medium text-slate-500 shadow-lg ring-1 ring-black/5"
        >
          {recuadro}
        </div>
        <div className="min-w-0 flex-1 basis-72 space-y-1 sm:pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {estado}
          </div>
          {datos ? <div className="text-[15px] text-foreground/80">{datos}</div> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 sm:pt-4">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * Encabezado de una página sin banda (listas, subpáginas de configuración). `compacto` es el del editor de cotización:
 * título más chico y en semibold para que entren el número, la pastilla y tres botones en una fila a 1200 px.
 */
export function HeaderPage({
  titulo: title,
  descripcion,
  extra,
  actions,
  compact = false,
}: {
  titulo: string
  descripcion?: React.ReactNode
  extra?: React.ReactNode
  actions?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className={cn(
              'leading-tight tracking-tight',
              compact ? 'text-[1.75rem] font-semibold' : 'text-[2.1875rem] font-normal',
            )}
          >
            {title}
          </h1>
          {extra}
        </div>
        {descripcion ? <p className="text-[15px] text-muted-foreground">{descripcion}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Margen del contenido de cada página, debajo de la barra de migas y la banda. */
export function Content({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('max-w-[90rem] space-y-6 px-4 py-8 md:px-9', className)}>{children}</div>
}
