'use client'

import { useRouter } from 'next/navigation'
import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { eliminarTemplate, saveTemplateEditor } from '@/app/(app)/cotizaciones/specials-actions'
import { Content } from '@/components/app-shell/header'
import { CardSubject } from '@/components/quotes/editor/card-subject'
import { CardItems } from '@/components/quotes/editor/card-items'
import { CardTexts } from '@/components/quotes/editor/card-texts'
import { Field } from '@/components/form/field'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { Card } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { reduceEditor, type StatusEditor, type TemplateEditor } from '@/lib/quotes/editor'

const LISTA = '/configuracion/plantillas'

export function EditorTemplate({
  id,
  nombre: initialName,
  initial,
  plantilla: template,
}: {
  id: string
  nombre: string
  initial: StatusEditor
  plantilla: TemplateEditor
}) {
  const router = useRouter()
  const [estado, despachar] = useReducer(reduceEditor, initial)
  const [nombre, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const borradores = useRef(new Map<string, () => void>())
  const actual = useRef(estado)
  const inCurso = useRef(false)

  useLayoutEffect(() => {
    actual.current = estado
  }, [estado])

  function registerDraft(clave: string, apply: (() => void) | null) {
    if (apply) borradores.current.set(clave, apply)
    else borradores.current.delete(clave)
  }

  async function save(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (inCurso.current) return
    flushSync(() => {
      for (const apply of borradores.current.values()) apply()
    })
    inCurso.current = true
    setBusy(true)
    setMessage('')
    try {
      const result = await saveTemplateEditor(actual.current, nombre, id)
      if (!result.ok) setMessage(result.message)
      else {
        toast.success('Plantilla guardada')
        router.push(LISTA)
      }
    } catch {
      setMessage('No se pudo guardar. Probá nuevamente.')
    } finally {
      inCurso.current = false
      setBusy(false)
    }
  }

  async function eliminar() {
    if (inCurso.current) return
    inCurso.current = true
    setBusy(true)
    setMessage('')
    try {
      const result = await eliminarTemplate(id)
      if (result.ok) {
        toast.success(result.message)
        router.push(LISTA)
      } else setMessage(result.message)
    } catch {
      setMessage('No se pudo eliminar. Probá nuevamente.')
    } finally {
      inCurso.current = false
      setBusy(false)
    }
  }

  return (
    <Content className="max-w-6xl pb-28">
      <HeaderForm
        titulo={`Editar plantilla: ${initialName}`}
        descripcion="Los cambios se aplican a futuras cotizaciones. Las existentes conservan su contenido."
        actions={
          <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmando(true)}>
            Eliminar plantilla
          </Button>
        }
      />
      {confirmando ? (
        <ConfirmationInLugar
          pregunta="¿Eliminar esta plantilla?"
          detail="Si ya fue usada, se archiva para conservar el histórico."
          textConfirm="Eliminar"
          tone="peligro"
          pendiente={busy}
          onCancelar={() => setConfirmando(false)}
          onConfirm={eliminar}
        />
      ) : null}
      <form onSubmit={save}>
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
          <SheetForm>
            <Card
              titulo="Datos de la plantilla"
              descripcion="Nombre, formato y validez de las cotizaciones nuevas."
            >
              <div className="grid gap-4 @md:grid-cols-2">
                <Field id="plantilla-nombre" label="Nombre" className="@md:col-span-2">
                  <Input
                    id="plantilla-nombre"
                    value={nombre}
                    onChange={(evento) => setName(evento.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field id="plantilla-formato" label="Formato">
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
                </Field>
                <Field id="plantilla-validez" label="Validez (días)">
                  <Input
                    id="plantilla-validez"
                    type="number"
                    min={1}
                    max={365}
                    value={estado.validezDias}
                    onChange={(evento) => despachar({ tipo: 'campo', campo: 'validezDias', value: evento.target.value })}
                  />
                </Field>
              </div>
            </Card>
            <CardSubject estado={estado} errors={{}} despachar={despachar} />
            <CardItems
              items={estado.items}
              formato={estado.formato}
              mostrarTotal={estado.mostrarTotal}
              editPrices={false}
              errors={{}}
              despachar={despachar}
              onChangeDraftSection={registerDraft}
            />
            <CardTexts bloques={estado.bloques} plantilla={template} errors={{}} despachar={despachar} />
          </SheetForm>
          <ActionsForm back={LISTA} textButton="Guardar plantilla" pendiente={busy} />
        </fieldset>
      </form>
    </Content>
  )
}
