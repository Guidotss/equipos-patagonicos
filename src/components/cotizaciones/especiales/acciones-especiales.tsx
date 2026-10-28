'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { aprobarCotizacion, borrarCotizacion, reabrirCotizacion, rechazarCotizacion, revertirAprobacion } from '@/app/(app)/cotizaciones/actions'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Accion = 'aprobar' | 'rechazar' | 'reabrir' | 'revertir' | 'borrar'
const ETIQUETAS = { aprobar: 'Aprobar', rechazar: 'Rechazar', reabrir: 'Reabrir', revertir: 'Revertir aprobación', borrar: 'Eliminar' }

export function AccionesEspeciales({ id, version, estado, origen, hoy, accionInicial }: { id: string; version: string; estado: string; origen: string; hoy: string; accionInicial?: string | null }) {
  const router = useRouter()
  const opciones: Accion[] = origen === 'directa' ? [] : estado === 'enviada' ? ['aprobar', 'rechazar', 'borrar'] : estado === 'rechazada' ? ['reabrir', 'borrar'] : estado === 'aprobada' ? ['revertir'] : []
  const [accion, setAccion] = useState<Accion | null>(() => accionInicial && opciones.includes(accionInicial as Accion) ? accionInicial as Accion : null)
  const [fecha, setFecha] = useState(hoy)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  useEffect(() => {
    if (!accionInicial) return
    const url = new URL(window.location.href)
    url.searchParams.delete('accion')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [accionInicial])
  async function confirmar() {
    if (!accion || ocupado) return
    setOcupado(true); setMensaje('')
    try {
      const r = accion === 'aprobar' ? await aprobarCotizacion(id, version, fecha) : accion === 'rechazar' ? await rechazarCotizacion(id) : accion === 'reabrir' ? await reabrirCotizacion(id) : accion === 'revertir' ? await revertirAprobacion(id) : await borrarCotizacion(id)
      if (!r.ok) { setMensaje(r.mensaje); return }
      toast.success(r.mensaje); setAccion(null)
      if (accion === 'borrar') router.push('/cotizaciones')
      else router.refresh()
    } catch { setMensaje('No se pudo completar la operación. Probá nuevamente.') }
    finally { setOcupado(false) }
  }
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">{opciones.map((a) => <Button key={a} variant="outline" onClick={() => setAccion(a)} disabled={ocupado}>{ETIQUETAS[a]}</Button>)}</div>
    {accion ? <ConfirmacionEnLugar pregunta={`¿${ETIQUETAS[accion]} esta cotización?`} textoConfirmar={ETIQUETAS[accion]} pendiente={ocupado} tono={accion === 'borrar' ? 'peligro' : 'aviso'} alCancelar={() => setAccion(null)} alConfirmar={() => void confirmar()}>{accion === 'aprobar' ? <label className="flex flex-col gap-1 text-sm">Fecha de aprobación<Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label> : null}</ConfirmacionEnLugar> : null}
    {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
  </div>
}
