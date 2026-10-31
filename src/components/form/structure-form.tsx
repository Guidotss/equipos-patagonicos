'use client'

import Link from 'next/link'
import { createContext, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ContextoHoja = createContext(false)
export const useHojaFormulario = () => useContext(ContextoHoja)

export function EncabezadoFormulario({ titulo, descripcion, estado, acciones }: {
  titulo: string
  descripcion?: React.ReactNode
  estado?: React.ReactNode
  acciones?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]">{titulo}</h1>
          {estado}
        </div>
        {descripcion ? <div className="max-w-2xl text-sm leading-6 text-muted-foreground">{descripcion}</div> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </header>
  )
}

export function HojaFormulario({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <ContextoHoja.Provider value>
      <div
        data-slot="form-sheet"
        className={cn(
          '@container/hoja min-w-0 divide-y rounded-xl border bg-card [&_[data-slot=input]]:h-10 [&_[data-slot=native-select]]:h-10 [&_[data-slot=label]]:text-sm [&_[data-slot=label]]:font-medium [&_[data-slot=label]]:text-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ContextoHoja.Provider>
  )
}

export function SeccionFormulario({ titulo, descripcion, acciones, franja, apilada = false, children }: {
  titulo: string
  descripcion?: React.ReactNode
  acciones?: React.ReactNode
  franja?: React.ReactNode
  apilada?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={cn('grid min-w-0 gap-5 p-4 sm:p-6', !apilada && '@3xl/hoja:grid-cols-[11rem_minmax(0,1fr)] @3xl/hoja:gap-7')}>
      <div className="min-w-0 space-y-1.5">
        <h2 className="text-base leading-6 font-semibold tracking-tight">{titulo}</h2>
        {descripcion ? <p className="text-[13px] leading-5 text-muted-foreground">{descripcion}</p> : null}
      </div>
      <div className={cn('@container min-w-0 space-y-4', !apilada && '@3xl/hoja:border-l @3xl/hoja:pl-7')}>
        {acciones ? <div className="flex flex-wrap items-center justify-end gap-2">{acciones}</div> : null}
        {children}
        {franja ? <div className="space-y-1 rounded-lg bg-muted/60 p-4 text-sm leading-6">{franja}</div> : null}
      </div>
    </section>
  )
}

export function AccionesFormulario({ volver, textoBoton, pendiente = false, soloLectura = false, detalle, disabled = false, children }: {
  volver: string
  textoBoton: string
  pendiente?: boolean
  soloLectura?: boolean
  detalle?: React.ReactNode
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:left-60 md:px-9">
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
        <p className="mr-auto hidden text-xs text-muted-foreground md:block">{detalle ?? 'Los cambios se aplican al guardar.'}</p>
        {children}
        <Button asChild variant="outline" className="h-10 flex-1 px-5 sm:flex-none"><Link href={volver}>Cancelar</Link></Button>
        {!soloLectura ? <Button type="submit" disabled={pendiente || disabled} className="h-10 flex-1 px-5 sm:flex-none">{pendiente ? 'Guardando…' : textoBoton}</Button> : null}
      </div>
    </div>
  )
}
