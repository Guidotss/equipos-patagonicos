'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { actualizarSeguimiento } from '@/app/(app)/cotizaciones/especiales-actions'
import { Campo } from '@/components/formulario/campo'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function Seguimiento({ id, version, notas, fecha }: { id: string; version: string; notas: string; fecha: string | null }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  return <Tarjeta titulo="Seguimiento interno" descripcion="Las notas y la próxima actualización no modifican el PDF aprobado.">
    <form onSubmit={async (e) => {
      e.preventDefault()
      if (ocupado) return
      const fd = new FormData(e.currentTarget); setOcupado(true); setMensaje('')
      try {
        const r = await actualizarSeguimiento(id, version, String(fd.get('notas') ?? ''), String(fd.get('fecha') ?? ''))
        if (!r.ok) setMensaje(r.mensaje)
        else { toast.success(r.mensaje); router.refresh() }
      } catch { setMensaje('No se pudo guardar. Probá nuevamente.') }
      finally { setOcupado(false) }
    }} className="flex flex-col gap-4">
      <Campo id="seguimiento-notas" etiqueta="Notas internas"><Textarea id="seguimiento-notas" name="notas" maxLength={2000} defaultValue={notas} disabled={ocupado} /></Campo>
      <Campo id="seguimiento-fecha" etiqueta="Próxima actualización de tarifa"><Input id="seguimiento-fecha" type="date" name="fecha" defaultValue={fecha ?? ''} disabled={ocupado} className="max-w-64" /></Campo>
      {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
      <Button type="submit" variant="outline" disabled={ocupado} className="self-start">{ocupado ? 'Guardando…' : 'Guardar seguimiento'}</Button>
    </form>
  </Tarjeta>
}
