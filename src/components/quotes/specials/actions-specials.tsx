'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { approveQuote, removeQuote, reopenQuote, rejectQuote, revertApproval } from '@/app/(app)/cotizaciones/actions'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Action = 'aprobar' | 'rechazar' | 'reabrir' | 'revertir' | 'borrar'
const ETIQUETAS = { aprobar: 'Aprobar', rechazar: 'Rechazar', reabrir: 'Reabrir', revertir: 'Revertir aprobación', borrar: 'Eliminar' }

export function ActionsSpecials({ id, version, estado, origen, today, actionInitial }: { id: string; version: string; estado: string; origen: string; today: string; actionInitial?: string | null }) {
  const router = useRouter()
  const options: Action[] = origen === 'directa' ? [] : estado === 'enviada' ? ['aprobar', 'rechazar', 'borrar'] : estado === 'rechazada' ? ['reabrir', 'borrar'] : estado === 'aprobada' ? ['revertir'] : []
  const [accion, setAction] = useState<Action | null>(() => actionInitial && options.includes(actionInitial as Action) ? actionInitial as Action : null)
  const [fecha, setDate] = useState(today)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!actionInitial) return
    const url = new URL(window.location.href)
    url.searchParams.delete('accion')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [actionInitial])
  async function confirm() {
    if (!accion || busy) return
    setBusy(true); setMessage('')
    try {
      const r = accion === 'aprobar' ? await approveQuote(id, version, fecha) : accion === 'rechazar' ? await rejectQuote(id) : accion === 'reabrir' ? await reopenQuote(id) : accion === 'revertir' ? await revertApproval(id) : await removeQuote(id)
      if (!r.ok) { setMessage(r.message); return }
      toast.success(r.message); setAction(null)
      if (accion === 'borrar') router.push('/cotizaciones')
      else router.refresh()
    } catch { setMessage('No se pudo completar la operación. Probá nuevamente.') }
    finally { setBusy(false) }
  }
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">{options.map((a) => <Button key={a} variant="outline" onClick={() => setAction(a)} disabled={busy}>{ETIQUETAS[a]}</Button>)}</div>
    {accion ? <ConfirmationInLugar pregunta={`¿${ETIQUETAS[accion]} esta cotización?`} textConfirm={ETIQUETAS[accion]} pendiente={busy} tone={accion === 'borrar' ? 'peligro' : 'aviso'} onCancelar={() => setAction(null)} onConfirm={() => void confirm()}>{accion === 'aprobar' ? <label className="flex flex-col gap-1 text-sm">Fecha de aprobación<Input type="date" value={fecha} onChange={(e) => setDate(e.target.value)} /></label> : null}</ConfirmationInLugar> : null}
    {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
  </div>
}
