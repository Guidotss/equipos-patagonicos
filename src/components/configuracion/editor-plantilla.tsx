'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'
import { eliminarPlantilla, guardarPlantillaEditor } from '@/app/(app)/cotizaciones/especiales-actions'
import { Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { TarjetaAsunto } from '@/components/cotizaciones/editor/tarjeta-asunto'
import { TarjetaItems } from '@/components/cotizaciones/editor/tarjeta-items'
import { TarjetaTextos } from '@/components/cotizaciones/editor/tarjeta-textos'
import { Campo } from '@/components/formulario/campo'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { reducirEditor, type EstadoEditor, type PlantillaEditor } from '@/lib/cotizaciones/editor'
import { flushSync } from 'react-dom'

export function EditorPlantilla({ id, nombre: inicialNombre, inicial, plantilla }: { id: string; nombre: string; inicial: EstadoEditor; plantilla: PlantillaEditor }) {
  const router = useRouter()
  const [estado, despachar] = useReducer(reducirEditor, inicial)
  const [nombre, setNombre] = useState(inicialNombre)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const borradores = useRef(new Map<string, () => void>())
  const actual = useRef(estado)
  useLayoutEffect(() => { actual.current = estado }, [estado])
  const enCurso = useRef(false)
  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    flushSync(() => { for (const aplicar of borradores.current.values()) aplicar() })
    enCurso.current = true; setOcupado(true); setMensaje('')
    try {
      const r = await guardarPlantillaEditor(actual.current, nombre, id)
      if (!r.ok) setMensaje(r.mensaje)
      else { toast.success('Plantilla guardada'); router.push('/configuracion/plantillas') }
    } catch { setMensaje('No se pudo guardar. Probá nuevamente.') }
    finally { enCurso.current = false; setOcupado(false) }
  }
  return <Contenido><EncabezadoPagina titulo={`Editar plantilla: ${inicialNombre}`} descripcion="Los cambios se aplican a futuras cotizaciones. Las existentes conservan su contenido." />
    <form onSubmit={guardar} className="max-w-4xl"><fieldset disabled={ocupado} className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Campo id="plantilla-nombre" etiqueta="Nombre"><Input id="plantilla-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} required /></Campo>
        <Campo id="plantilla-formato" etiqueta="Formato"><NativeSelect id="plantilla-formato" value={estado.formato} onChange={(e) => despachar({ tipo: 'reemplazar', estado: { ...estado, formato: e.target.value as 'jornada' | 'mensual' } })}><NativeSelectOption value="jornada">Por jornada</NativeSelectOption><NativeSelectOption value="mensual">Mensual</NativeSelectOption></NativeSelect></Campo>
        <Campo id="plantilla-validez" etiqueta="Validez (días)"><Input id="plantilla-validez" type="number" min={1} max={365} value={estado.validezDias} onChange={(e) => despachar({ tipo: 'campo', campo: 'validezDias', valor: e.target.value })} /></Campo>
      </div>
      <TarjetaAsunto estado={estado} errores={{}} despachar={despachar} />
      <TarjetaItems items={estado.items} formato={estado.formato} mostrarTotal={estado.mostrarTotal} errores={{}} despachar={despachar} alCambiarBorradorSeccion={(clave, aplicar) => { if (aplicar) borradores.current.set(clave, aplicar); else borradores.current.delete(clave) }} />
      <TarjetaTextos bloques={estado.bloques} plantilla={plantilla} errores={{}} despachar={despachar} />
      <p className="text-sm text-muted-foreground">Los precios que se escriban aquí no se guardan en la plantilla.</p>
      {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="submit">{ocupado ? 'Guardando…' : 'Guardar plantilla'}</Button><Button asChild variant="outline"><Link href="/configuracion/plantillas">Volver</Link></Button><Button type="button" variant="ghost" onClick={() => setConfirmando(true)}>Eliminar plantilla</Button></div>
    </fieldset></form>
    {confirmando ? <ConfirmacionEnLugar pregunta="¿Eliminar esta plantilla?" detalle="Si ya fue usada, se archiva para conservar el histórico." textoConfirmar="Eliminar" tono="peligro" pendiente={ocupado} alCancelar={() => setConfirmando(false)} alConfirmar={async () => { setOcupado(true); try { const r = await eliminarPlantilla(id); if (r.ok) { toast.success(r.mensaje); router.push('/configuracion/plantillas') } else setMensaje(r.mensaje) } finally { setOcupado(false) } }} /> : null}
  </Contenido>
}
