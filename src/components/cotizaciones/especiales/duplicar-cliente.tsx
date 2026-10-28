'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { duplicarCotizacion } from '@/app/(app)/cotizaciones/actions'
import { SelectorCliente, type ClienteBuscado } from '@/components/cotizaciones/editor/selector-cliente'
import { Campo } from '@/components/formulario/campo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function DuplicarCliente({ id, abierto, alCerrar }: { id: string; abierto: boolean; alCerrar: () => void }) {
  const router = useRouter()
  const [cliente, setCliente] = useState<ClienteBuscado | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const enCurso = useRef(false)
  return <Dialog open={abierto} onOpenChange={(open) => { if (!open && !ocupado) alCerrar() }}><DialogContent><DialogHeader><DialogTitle>Duplicar a otro cliente</DialogTitle><DialogDescription>Se crea un borrador con un número nuevo. Revisá los textos y precios antes de enviarlo.</DialogDescription></DialogHeader>
    <form className="flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault()
      if (!cliente || enCurso.current) return
      enCurso.current = true; setOcupado(true)
      try { const r = await duplicarCotizacion(id, cliente.id); if (!r.ok) setMensaje(r.mensaje); else { toast.success('Cotización duplicada'); alCerrar(); router.push(`/cotizaciones/${r.datos.id}`) } }
      catch { setMensaje('No se pudo duplicar. Probá nuevamente.') }
      finally { enCurso.current = false; setOcupado(false) }
    }}><Campo id="duplicar-cliente" etiqueta="Cliente de la nueva cotización"><SelectorCliente id="duplicar-cliente" cliente={cliente} alElegir={setCliente} /></Campo>
      {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}<Button type="submit" disabled={ocupado || !cliente}>{ocupado ? 'Duplicando…' : 'Crear borrador para este cliente'}</Button>
    </form>
  </DialogContent></Dialog>
}
