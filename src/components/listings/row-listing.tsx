'use client'

import { useRouter } from 'next/navigation'
import { TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/** La fila amplía el blanco del clic; el enlace real conserva navegación por teclado y acciones del navegador. */
export function FilaListado({ href, className, ...props }: React.ComponentProps<'tr'> & { href: string }) {
  const router = useRouter()
  return (
    <TableRow
      {...props}
      className={cn('cursor-pointer hover:bg-accent/30 focus-within:bg-accent/30', className)}
      onClick={(evento) => {
        props.onClick?.(evento)
        if (evento.defaultPrevented || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
        const destino = evento.target
        // Los portales de los menús/dialogos propagan el evento React, aunque no están dentro de la fila en el DOM.
        if (!(destino instanceof Node) || !evento.currentTarget.contains(destino)) return
        if (destino instanceof Element && destino.closest('a, button, input, select, textarea, [role="button"], [role="menuitem"]')) return
        if (window.getSelection()?.toString()) return
        router.push(href)
      }}
    />
  )
}
