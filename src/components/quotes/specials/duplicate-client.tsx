'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { duplicateQuote } from '@/app/(app)/cotizaciones/actions'
import { SelectorClient, type ClientSearchResult } from '@/components/quotes/editor/selector-client'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DuplicateClient({ id, open, onCerrar }: { id: string; open: boolean; onCerrar: () => void }) {
  const router = useRouter()
  const [cliente, setClient] = useState<ClientSearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inCurso = useRef(false)
  return <Dialog open={open} onOpenChange={(open) => { if (!open && !busy) onCerrar() }}><DialogContent><DialogHeader><DialogTitle>Duplicar a otro cliente</DialogTitle><DialogDescription>Se crea un borrador con un número nuevo. Revisá los textos y precios antes de enviarlo.</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault()
      if (!cliente || inCurso.current) return
      inCurso.current = true; setBusy(true)
      try { const r = await duplicateQuote(id, cliente.id); if (!r.ok) setMessage(r.message); else { toast.success('Cotización duplicada'); onCerrar(); router.push(`/cotizaciones/${r.datos.id}`) } }
      catch { setMessage('No se pudo duplicar. Probá nuevamente.') }
      finally { inCurso.current = false; setBusy(false) }
    }}><Field id="duplicar-cliente" label="Cliente de la nueva cotización"><SelectorClient id="duplicar-cliente" cliente={cliente} onChoose={setClient} /></Field>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}<Button type="submit" disabled={busy || !cliente}>{busy ? 'Duplicando…' : 'Crear borrador para este cliente'}</Button>
    </form>
  </DialogContent></Dialog>
}
