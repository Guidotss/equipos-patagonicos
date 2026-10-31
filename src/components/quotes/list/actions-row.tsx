'use client'

import { Copy, Ellipsis, FileDown, FileText, LoaderCircle, SquarePen } from 'lucide-react'
import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { DuplicateClient } from '@/components/quotes/specials/duplicate-client'
import { toast } from 'sonner'
import { duplicateQuote } from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ListTransition } from '@/lib/quotes/actions-status'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Acciones de una fila de la lista. En la tabla: PDF (salvo un presupuesto directo) y ⋯; en el celular,
 * todo dentro del ⋯. Las transiciones del ⋯ llevan al editor con su confirmación abierta (`?accion=`).
 */
export function ActionsRow({
  id,
  numero,
  tienePdf,
  transiciones = [],
  variante = 'tabla',
}: {
  id: string
  numero: number
  tienePdf: boolean
  /** Las del ⋯ según el estado (transicionesDeLista, Task 12): abren el editor con la confirmación abierta. */
  transiciones?: ListTransition[]
  variante?: 'tabla' | 'movil'
}) {
  const router = useRouter()
  const [duplicando, iniciarDuplicado] = useTransition()
  const pdf = `/cotizaciones/${id}/pdf`
  const [otroClient, setOtroClient] = useState(false)

  function duplicate() {
    iniciarDuplicado(async () => {
      try {
        const result = await duplicateQuote(id)
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        toast.success(`Se creó un borrador a partir de la ${numero}`)
        router.push(`/cotizaciones/${result.datos.id}`)
      } catch (error) {
        unstable_rethrow(error)
        toast.error('No se pudo duplicar la cotización. Probá de nuevo.')
      }
    })
  }

  const menu = (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={variante === 'movil' ? 'size-11 text-muted-foreground' : 'text-muted-foreground'}
          aria-label={`Más acciones de la ${numero}`}
          aria-busy={duplicando}
          disabled={duplicando}
        >
          {duplicando ? <LoaderCircle className="animate-spin" /> : <Ellipsis />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={variante === 'movil' ? 'w-56 [&_[role=menuitem]]:min-h-11' : 'w-56'}>
        <DropdownMenuItem asChild>
          <Link href={`/cotizaciones/${id}`}>
            <SquarePen aria-hidden />
            Abrir
          </Link>
        </DropdownMenuItem>
        {tienePdf && variante === 'movil' ? (
          <DropdownMenuItem asChild>
            <a href={pdf} target="_blank" rel="noopener noreferrer">
              <FileText aria-hidden />
              Ver PDF
            </a>
          </DropdownMenuItem>
        ) : null}
        {tienePdf ? (
          <DropdownMenuItem asChild>
            <a href={`${pdf}?descargar=1`}>
              <FileDown aria-hidden />
              Descargar PDF
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={duplicando} onSelect={duplicate}>
          <Copy aria-hidden />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem disabled={duplicando} onSelect={() => setOtroClient(true)}><Copy aria-hidden />Duplicar a otro cliente</DropdownMenuItem>
        {transiciones.length > 0 ? <DropdownMenuSeparator /> : null}
        {transiciones.map(({ action: accion, label }) => (
          <DropdownMenuItem key={accion} asChild variant={accion === 'borrar' ? 'destructive' : 'default'}>
            <Link href={`/cotizaciones/${id}?accion=${accion}`}>{label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
    <DuplicateClient id={id} open={otroClient} onCerrar={() => setOtroClient(false)} />
    </>
  )

  if (variante === 'movil') return menu

  return (
    <div className="flex items-center justify-end gap-1">
      {tienePdf ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
              <a href={pdf} target="_blank" rel="noopener noreferrer" aria-label={`Ver PDF de la ${numero}`}>
                <FileText />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver PDF</TooltipContent>
        </Tooltip>
      ) : (
        // Mantiene alineado el menú cuando el presupuesto directo no tiene PDF.
        <span aria-hidden className="size-7" />
      )}
      {menu}
    </div>
  )
}
