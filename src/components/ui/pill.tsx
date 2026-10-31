import { cn } from '@/lib/utils'

const TONOS = {
  exito: 'bg-green-100 text-green-800',
  info: 'bg-blue-100 text-blue-800',
  aviso: 'bg-amber-100 text-amber-800',
  peligro: 'bg-red-100 text-red-800',
  neutro: 'bg-slate-100 text-slate-600',
} as const

export type TonoPastilla = keyof typeof TONOS

/** Estado con punto de color (Activo, Inactivo, Enviada…), como en las referencias de docs/diseno. */
export function Pastilla({
  tono = 'neutro',
  className,
  children,
}: {
  tono?: TonoPastilla
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium whitespace-nowrap',
        TONOS[tono],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  )
}
