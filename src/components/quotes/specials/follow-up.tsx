'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { updateFollowUp } from '@/app/(app)/cotizaciones/specials-actions'
import { Field } from '@/components/form/field'
import { Card } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function FollowUp({ id, version, notas, fecha }: { id: string; version: string; notas: string; fecha: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <Card titulo="Seguimiento interno" descripcion="Las notas y la próxima actualización no modifican el PDF aprobado.">
    <form onSubmit={async (e) => {
      e.preventDefault()
      if (busy) return
      const fd = new FormData(e.currentTarget); setBusy(true); setMessage('')
      try {
        const r = await updateFollowUp(id, version, String(fd.get('notas') ?? ''), String(fd.get('fecha') ?? ''))
        if (!r.ok) setMessage(r.message)
        else { toast.success(r.message); router.refresh() }
      } catch { setMessage('No se pudo guardar. Probá nuevamente.') }
      finally { setBusy(false) }
    }} className="flex flex-col gap-4">
      <Field id="seguimiento-notas" label="Notas internas"><Textarea id="seguimiento-notas" name="notas" maxLength={2000} defaultValue={notas} disabled={busy} /></Field>
      <Field id="seguimiento-fecha" label="Próxima actualización de tarifa"><Input id="seguimiento-fecha" type="date" name="fecha" defaultValue={fecha ?? ''} disabled={busy} className="max-w-64" /></Field>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      <Button type="submit" variant="outline" disabled={busy} className="self-start">{busy ? 'Guardando…' : 'Guardar seguimiento'}</Button>
    </form>
  </Card>
}
