import { Table } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** El scroll pertenece a la tabla: filtros y paginación permanecen fuera y el encabezado acompaña a las filas. */
export function TablaListado({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <Table
      containerClassName="max-h-[max(20rem,calc(100dvh-21rem))] overscroll-contain rounded-t-none focus-visible:outline-2 focus-visible:outline-ring"
      className={cn(
        'table-fixed [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-muted [&_th]:h-11 [&_th]:px-4 [&_th]:text-[13px] [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:px-4 [&_td]:py-3 [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]',
        className,
      )}
      {...props}
    />
  )
}
