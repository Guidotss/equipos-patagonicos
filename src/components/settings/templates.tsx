import { FileText, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { cn } from '@/lib/utils'

export type TemplateWithActions = {
  id: string
  nombre: string
  formato: string
  activa: boolean
  button: React.ReactNode
}

export function Templates({ plantillas }: { plantillas: TemplateWithActions[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      {plantillas.map((template) => (
        <li key={template.id} className="flex items-center gap-4 p-4 sm:p-5">
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center self-start rounded-xl sm:size-12 sm:self-center',
              template.activa ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <FileText className="size-5 sm:size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/configuracion/plantillas/${template.id}`}
                className={cn(
                  'text-lg font-medium hover:text-primary hover:underline',
                  template.activa ? null : 'text-muted-foreground',
                )}
              >
                {template.nombre}
              </Link>
              <span
                className={cn(
                  'inline-flex h-6 items-center rounded-md bg-slate-200/70 px-2 text-sm',
                  template.activa ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {template.formato}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {template.activa ? <Pill tone="exito">Activa</Pill> : <Pill>Inactiva</Pill>}
              {/* Va al mismo lugar que el nombre, que ya es el link accesible: el lápiz es solo un atajo visual
                  (con aria-label sería otro link con el nombre adentro y una parada de tab repetida). */}
              <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                <Link
                  href={`/configuracion/plantillas/${template.id}`}
                  aria-hidden
                  tabIndex={-1}
                  title={`Renombrar ${template.nombre}`}
                >
                  <Pencil />
                </Link>
              </Button>
              {template.button}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
