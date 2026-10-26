'use client'

import { Copy, Ellipsis, FileDown, FileText, LoaderCircle, SquarePen } from 'lucide-react'
import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { duplicarCotizacion } from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Acciones de una fila de la lista. En la tabla: PDF (salvo un presupuesto directo), Duplicar y ⋯; en el celular,
 * todo dentro del ⋯. Las transiciones (aprobar, rechazar…) las suma la Task 12: llevan al editor con su confirmación.
 */
export function AccionesFila({
  id,
  numero,
  tienePdf,
  variante = 'tabla',
}: {
  id: string
  numero: number
  tienePdf: boolean
  variante?: 'tabla' | 'movil'
}) {
  const router = useRouter()
  const [duplicando, iniciarDuplicado] = useTransition()
  const pdf = `/cotizaciones/${id}/pdf`

  // Un clic crea el borrador y abre el editor: el cliente se cambia ahí (decisión del diseño, §6).
  function duplicar() {
    iniciarDuplicado(async () => {
      try {
        const resultado = await duplicarCotizacion(id)
        if (!resultado.ok) {
          toast.error(resultado.mensaje)
          return
        }
        toast.success(`Se creó un borrador a partir de la ${numero}`)
        router.push(`/cotizaciones/${resultado.datos.id}`)
      } catch (error) {
        unstable_rethrow(error)
        toast.error('No se pudo duplicar la cotización. Probá de nuevo.')
      }
    })
  }

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={`Más acciones de la ${numero}`}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
        {variante === 'movil' ? (
          <DropdownMenuItem disabled={duplicando} onSelect={duplicar}>
            <Copy aria-hidden />
            Duplicar
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
        // Un presupuesto directo no tiene PDF: el hueco mantiene alineados los otros dos íconos.
        <span aria-hidden className="size-7" />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Duplicar la ${numero}`}
            disabled={duplicando}
            onClick={duplicar}
          >
            {duplicando ? <LoaderCircle className="animate-spin" /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Duplicar</TooltipContent>
      </Tooltip>
      {menu}
    </div>
  )
}
