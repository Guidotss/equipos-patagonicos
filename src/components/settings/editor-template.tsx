'use client'

import { useRouter } from 'next/navigation'
import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { deleteTemplate, saveTemplateEditor } from '@/app/(app)/cotizaciones/specials-actions'
import { Content } from '@/components/app-shell/header'
import { CardSubject } from '@/components/quotes/editor/card-subject'
import { CardItems } from '@/components/quotes/editor/card-items'
import { CardTexts } from '@/components/quotes/editor/card-texts'
import { Field } from '@/components/form/field'
import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { Card } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { reduceEditor } from '@/lib/quotes/editor/reducer'
import type { StatusEditor, TemplateEditor } from '@/lib/quotes/editor/types'

const LIST_CLASS = '/configuracion/plantillas'

export function EditorTemplate({
  id,
  name: initialName,
  initial,
  template,
}: {
  id: string
  name: string
  initial: StatusEditor
  template: TemplateEditor
}) {
  const router = useRouter()
  const [state, dispatch] = useReducer(reduceEditor, initial)
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const drafts = useRef(new Map<string, () => void>())
  const current = useRef(state)
  const inProgress = useRef(false)

  useLayoutEffect(() => {
    current.current = state
  }, [state])

  function registerDraft(key: string, apply: (() => void) | null) {
    if (apply) drafts.current.set(key, apply)
    else drafts.current.delete(key)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inProgress.current) return
    flushSync(() => {
      for (const apply of drafts.current.values()) apply()
    })
    inProgress.current = true
    setBusy(true)
    setMessage('')
    try {
      const result = await saveTemplateEditor(current.current, name, id)
      if (!result.ok) setMessage(result.message)
      else {
        toast.success('Plantilla guardada')
        router.push(LIST_CLASS)
      }
    } catch {
      setMessage('No se pudo guardar. Probá nuevamente.')
    } finally {
      inProgress.current = false
      setBusy(false)
    }
  }

  async function removeTemplate() {
    if (inProgress.current) return
    inProgress.current = true
    setBusy(true)
    setMessage('')
    try {
      const result = await deleteTemplate(id)
      if (result.ok) {
        toast.success(result.message)
        router.push(LIST_CLASS)
      } else setMessage(result.message)
    } catch {
      setMessage('No se pudo eliminar. Probá nuevamente.')
    } finally {
      inProgress.current = false
      setBusy(false)
    }
  }

  return (
    <Content className="max-w-6xl pb-28">
      <HeaderForm
        titulo={`Editar plantilla: ${initialName}`}
        descripcion="Los cambios se aplican a futuras cotizaciones. Las existentes conservan su contenido."
        actions={
          <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
            Eliminar plantilla
          </Button>
        }
      />
      {confirming ? (
        <InlineConfirmation
          pregunta="¿Eliminar esta plantilla?"
          detail="Si ya fue usada, se archiva para conservar el histórico."
          textConfirm="Eliminar"
          tone="peligro"
          pendiente={busy}
          onCancelar={() => setConfirming(false)}
          onConfirm={removeTemplate}
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
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field id="plantilla-formato" label="Formato">
                  <NativeSelect
                    id="plantilla-formato"
                    className="w-full"
                    value={state.formato}
                    onChange={(event) => dispatch({
                      tipo: 'reemplazar',
                      estado: { ...state, formato: event.target.value as 'jornada' | 'mensual' },
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
                    value={state.validezDias}
                    onChange={(event) => dispatch({ tipo: 'campo', campo: 'validezDias', value: event.target.value })}
                  />
                </Field>
              </div>
            </Card>
            <CardSubject state={state} errors={{}} dispatch={dispatch} />
            <CardItems
              items={state.items}
              format={state.formato}
              showTotal={state.mostrarTotal}
              editPrices={false}
              errors={{}}
              dispatch={dispatch}
              onChangeDraftSection={registerDraft}
            />
            <CardTexts blocks={state.bloques} template={template} errors={{}} dispatch={dispatch} />
          </SheetForm>
          <ActionsForm back={LIST_CLASS} textButton="Guardar plantilla" pendiente={busy} />
        </fieldset>
      </form>
    </Content>
  )
}
