'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { saveTemplateEditor } from '@/app/(app)/cotizaciones/specials-actions'
import { Field } from '@/components/form/field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { StatusEditor } from '@/lib/quotes/editor'

export function SaveTemplate({ estado, disabled, antesOfAbrir }: { estado: StatusEditor; disabled?: boolean; antesOfAbrir?: () => void }) {
  const [open, setOpen] = useState(false)
  const [nombre, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const inCurso = useRef(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (inCurso.current) return
    inCurso.current = true; setBusy(true)
    try {
      const r = await saveTemplateEditor(estado, nombre)
      if (!r.ok) { setMessage(r.message); return }
      toast.success('Plantilla guardada'); setOpen(false)
    } catch { setMessage('No se pudo guardar. Probá nuevamente.') }
    finally { inCurso.current = false; setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(open) => { if (open) antesOfAbrir?.(); setOpen(open) }}>
    <DialogTrigger asChild><Button variant="outline" disabled={disabled}>Guardar como plantilla</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Guardar como plantilla</DialogTitle><DialogDescription>Se guardan los textos y los ítems sin precios ni datos del cliente.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="flex flex-col gap-4"><Field id="nombre-nueva-plantilla" label="Nombre de la plantilla"><Input id="nombre-nueva-plantilla" maxLength={100} value={nombre} onChange={(e) => setName(e.target.value)} disabled={busy} required /></Field>
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Crear plantilla'}</Button>
      </form>
    </DialogContent>
  </Dialog>
}
