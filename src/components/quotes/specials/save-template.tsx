'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { guardarPlantillaEditor } from '@/app/(app)/cotizaciones/especiales-actions'
import { Campo } from '@/components/formulario/campo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'

export function GuardarPlantilla({ estado, disabled, antesDeAbrir }: { estado: EstadoEditor; disabled?: boolean; antesDeAbrir?: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const enCurso = useRef(false)
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true; setOcupado(true)
    try {
      const r = await guardarPlantillaEditor(estado, nombre)
      if (!r.ok) { setMensaje(r.mensaje); return }
      toast.success('Plantilla guardada'); setAbierto(false)
    } catch { setMensaje('No se pudo guardar. Probá nuevamente.') }
    finally { enCurso.current = false; setOcupado(false) }
  }
  return <Dialog open={abierto} onOpenChange={(open) => { if (open) antesDeAbrir?.(); setAbierto(open) }}>
    <DialogTrigger asChild><Button variant="outline" disabled={disabled}>Guardar como plantilla</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Guardar como plantilla</DialogTitle><DialogDescription>Se guardan los textos y los ítems sin precios ni datos del cliente.</DialogDescription></DialogHeader>
      <form onSubmit={guardar} className="flex flex-col gap-4"><Campo id="nombre-nueva-plantilla" etiqueta="Nombre de la plantilla"><Input id="nombre-nueva-plantilla" maxLength={100} value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={ocupado} required /></Campo>
        {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Crear plantilla'}</Button>
      </form>
    </DialogContent>
  </Dialog>
}
