'use client'

import { useRouter } from 'next/navigation'
import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { eliminarPlantilla, guardarPlantillaEditor } from '@/app/(app)/cotizaciones/especiales-actions'
import { Contenido } from '@/components/app-shell/encabezado'
import { TarjetaAsunto } from '@/components/cotizaciones/editor/tarjeta-asunto'
import { TarjetaItems } from '@/components/cotizaciones/editor/tarjeta-items'
import { TarjetaTextos } from '@/components/cotizaciones/editor/tarjeta-textos'
import { Campo } from '@/components/formulario/campo'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { AccionesFormulario, EncabezadoFormulario, HojaFormulario } from '@/components/formulario/estructura-formulario'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { reducirEditor, type EstadoEditor, type PlantillaEditor } from '@/lib/cotizaciones/editor'

const LISTA = '/configuracion/plantillas'

export function EditorPlantilla({
  id,
  nombre: inicialNombre,
  inicial,
  plantilla,
}: {
  id: string
  nombre: string
  inicial: EstadoEditor
  plantilla: PlantillaEditor
}) {
  const router = useRouter()
  const [estado, despachar] = useReducer(reducirEditor, inicial)
  const [nombre, setNombre] = useState(inicialNombre)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const borradores = useRef(new Map<string, () => void>())
  const actual = useRef(estado)
  const enCurso = useRef(false)

  useLayoutEffect(() => {
    actual.current = estado
  }, [estado])

  function registrarBorrador(clave: string, aplicar: (() => void) | null) {
    if (aplicar) borradores.current.set(clave, aplicar)
    else borradores.current.delete(clave)
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enCurso.current) return
    flushSync(() => {
      for (const aplicar of borradores.current.values()) aplicar()
    })
    enCurso.current = true
    setOcupado(true)
    setMensaje('')
    try {
      const resultado = await guardarPlantillaEditor(actual.current, nombre, id)
      if (!resultado.ok) setMensaje(resultado.mensaje)
      else {
        toast.success('Plantilla guardada')
        router.push(LISTA)
      }
    } catch {
      setMensaje('No se pudo guardar. Probá nuevamente.')
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }

  async function eliminar() {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(true)
    setMensaje('')
    try {
      const resultado = await eliminarPlantilla(id)
      if (resultado.ok) {
        toast.success(resultado.mensaje)
        router.push(LISTA)
      } else setMensaje(resultado.mensaje)
    } catch {
      setMensaje('No se pudo eliminar. Probá nuevamente.')
    } finally {
      enCurso.current = false
      setOcupado(false)
    }
  }

  return (
    <Contenido className="max-w-6xl pb-28">
      <EncabezadoFormulario
        titulo={`Editar plantilla: ${inicialNombre}`}
        descripcion="Los cambios se aplican a futuras cotizaciones. Las existentes conservan su contenido."
        acciones={
          <Button type="button" variant="outline" disabled={ocupado} onClick={() => setConfirmando(true)}>
            Eliminar plantilla
          </Button>
        }
      />
      {confirmando ? (
        <ConfirmacionEnLugar
          pregunta="¿Eliminar esta plantilla?"
          detalle="Si ya fue usada, se archiva para conservar el histórico."
          textoConfirmar="Eliminar"
          tono="peligro"
          pendiente={ocupado}
          alCancelar={() => setConfirmando(false)}
          alConfirmar={eliminar}
        />
      ) : null}
      <form onSubmit={guardar}>
        <fieldset disabled={ocupado} className="min-w-0 space-y-6">
          {mensaje ? <p role="alert" className="text-sm text-destructive">{mensaje}</p> : null}
          <HojaFormulario>
            <Tarjeta
              titulo="Datos de la plantilla"
              descripcion="Nombre, formato y validez de las cotizaciones nuevas."
            >
              <div className="grid gap-4 @md:grid-cols-2">
                <Campo id="plantilla-nombre" etiqueta="Nombre" className="@md:col-span-2">
                  <Input
                    id="plantilla-nombre"
                    value={nombre}
                    onChange={(evento) => setNombre(evento.target.value)}
                    maxLength={100}
                    required
                  />
                </Campo>
                <Campo id="plantilla-formato" etiqueta="Formato">
                  <NativeSelect
                    id="plantilla-formato"
                    className="w-full"
                    value={estado.formato}
                    onChange={(evento) => despachar({
                      tipo: 'reemplazar',
                      estado: { ...estado, formato: evento.target.value as 'jornada' | 'mensual' },
                    })}
                  >
                    <NativeSelectOption value="jornada">Por jornada</NativeSelectOption>
                    <NativeSelectOption value="mensual">Mensual</NativeSelectOption>
                  </NativeSelect>
                </Campo>
                <Campo id="plantilla-validez" etiqueta="Validez (días)">
                  <Input
                    id="plantilla-validez"
                    type="number"
                    min={1}
                    max={365}
                    value={estado.validezDias}
                    onChange={(evento) => despachar({ tipo: 'campo', campo: 'validezDias', valor: evento.target.value })}
                  />
                </Campo>
              </div>
            </Tarjeta>
            <TarjetaAsunto estado={estado} errores={{}} despachar={despachar} />
            <TarjetaItems
              items={estado.items}
              formato={estado.formato}
              mostrarTotal={estado.mostrarTotal}
              editarPrecios={false}
              errores={{}}
              despachar={despachar}
              alCambiarBorradorSeccion={registrarBorrador}
            />
            <TarjetaTextos bloques={estado.bloques} plantilla={plantilla} errores={{}} despachar={despachar} />
          </HojaFormulario>
          <AccionesFormulario volver={LISTA} textoBoton="Guardar plantilla" pendiente={ocupado} />
        </fieldset>
      </form>
    </Contenido>
  )
}
