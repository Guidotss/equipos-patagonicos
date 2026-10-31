'use client'

import { Printer, Trash2 } from 'lucide-react'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useCallback, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Content } from '@/components/app-shell/header'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { Field } from '@/components/form/field'
import { FormAction } from '@/components/form/form-action'
import { MessageForm } from '@/components/form/message-form'
import { BandView, Highlight, Card, useViewInLive } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FieldContact } from '@/lib/clients/schemas'
import { valueField, type ActionForm, type StatusForm } from '@/lib/forms'

export type Contact = { nombre: string; cargo: string; email: string; telefono: string }

const CAMPOS: { campo: FieldContact; label: string; props?: React.ComponentProps<typeof Input> }[] = [
  { campo: 'nombre', label: 'Nombre' },
  { campo: 'cargo', label: 'Cargo' },
  { campo: 'email', label: 'Email', props: { type: 'email' } },
  { campo: 'telefono', label: 'Teléfono', props: { type: 'tel' } },
]

const FIELDS_VIEW = ['nombre', 'email'] as const

/** Como CamposGrilla, pero con los id "contacto-…" de siempre. */
function FieldsContact({ estado, initial }: { estado: StatusForm; initial?: Contact }) {
  return (
    <div className="grid gap-4 md:gap-y-3 @md:grid-cols-2">
      {CAMPOS.map(({ campo: field, label, props }) => {
        const id = `contacto-${field}`
        const error = estado.errors[field]
        return (
          <Field key={field} id={id} label={label} error={error}>
            <Input
              id={id}
              name={field}
              defaultValue={valueField(estado, initial, field)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              {...props}
            />
          </Field>
        )
      })}
    </div>
  )
}

/** El destinatario como lo arma el PDF (src/lib/pdf/cotizacion-mensual.tsx): el email solo si hay. */
function BandDestinatario({
  razonSocial,
  view,
}: {
  razonSocial: string
  view: Record<(typeof FIELDS_VIEW)[number], string>
}) {
  return (
    <BandView icon={Printer} titulo="Así sale en la cotización">
      <div className="[overflow-wrap:anywhere]">
        <p>{razonSocial}</p>
        <p>
          Atte. <Highlight>{view.nombre || '—'}</Highlight>
        </p>
        {view.email ? (
          <p>
            <Highlight>{view.email}</Highlight>
          </p>
        ) : null}
      </div>
      {view.email ? (
        <p className="pt-1 text-[13px] text-muted-foreground">La cotización por jornada no lleva el email.</p>
      ) : null}
    </BandView>
  )
}

/** Borrar sin modal: el botón pide confirmar en el mismo lugar. */
function RemoveContact({ nombre, borrar: remove, back }: { nombre: string; borrar: () => Promise<void>; back: string }) {
  const router = useRouter()
  const pregunta = useId()
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, iniciarBorrado] = useTransition()
  // El foco va a "Cancelar" al abrir la confirmación y vuelve al botón al cerrarla.
  const devolverFoco = useRef(false)
  const enfocar = useCallback((button: HTMLButtonElement | null) => button?.focus(), [])
  const onMontarButton = useCallback((button: HTMLButtonElement | null) => {
    if (button && devolverFoco.current) {
      devolverFoco.current = false
      button.focus()
    }
  }, [])

  function cancelar() {
    devolverFoco.current = true
    setConfirmando(false)
  }

  function confirm() {
    iniciarBorrado(async () => {
      try {
        await remove()
      } catch (error) {
        unstable_rethrow(error)
        toast.error('No se pudo borrar el contacto. Probá de nuevo.')
        return
      }
      toast.success('Contacto borrado')
      // Navegar mientras la acción sigue en curso descarta la re-renderización de esta página (el contacto ya no existe).
      router.push(back)
    })
  }

  if (!confirmando) {
    return (
      <Button ref={onMontarButton} type="button" variant="destructive" onClick={() => setConfirmando(true)}>
        <Trash2 aria-hidden />
        Borrar contacto
      </Button>
    )
  }

  return (
    <div
      role="group"
      aria-labelledby={pregunta}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && !borrando) cancelar()
      }}
      className="ml-auto flex w-full flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 sm:w-auto"
    >
      <p id={pregunta} className="text-sm">
        ¿Borrar a <span className="font-medium [overflow-wrap:anywhere]">{nombre}</span>? No se puede deshacer.
      </p>
      <div className="ml-auto flex gap-2">
        <Button ref={enfocar} type="button" variant="outline" onClick={cancelar} disabled={borrando}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={confirm}
          disabled={borrando}
          className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30"
        >
          {borrando ? 'Borrando…' : 'Borrar'}
        </Button>
      </div>
    </div>
  )
}

/** Alta y edición de un contacto del cliente en pantalla propia. Sin `inicial` es un alta. */
export function ContactForm({
  accion,
  clientId,
  razonSocial,
  initial,
  borrar: remove,
}: {
  accion: ActionForm
  clientId: string
  razonSocial: string
  initial?: Contact
  /** borrarContacto ligado al registro (solo edición). */
  borrar?: () => Promise<void>
}) {
  const router = useRouter()
  const back = `/clientes/${clientId}`
  const { view, onEscribir, sincronizar } = useViewInLive(FIELDS_VIEW, initial ?? {})
  const textSave = initial ? 'Guardar cambios' : 'Guardar contacto'

  return (
    <Content className="max-w-6xl pb-28">
      <HeaderForm titulo={initial?.nombre || 'Nuevo contacto'} descripcion={razonSocial} />
      <FormAction
        accion={accion}
        textButton={textSave}
        button={false}
        onSave={() => router.push(back)}
      >
        {(estado, pending) => (
          <>
            <div ref={sincronizar} onInput={onEscribir} className="space-y-6">
              <MessageForm estado={estado} />
              <SheetForm>
                <Card
                  titulo="Datos del contacto"
                  descripcion="El nombre y el email encabezan la cotización; el cargo y el teléfono no se imprimen."
                  band={<BandDestinatario razonSocial={razonSocial} view={view} />}
                >
                  <FieldsContact estado={estado} initial={initial} />
                </Card>
              </SheetForm>
            </div>
            <ActionsForm back={back} textButton={textSave} pendiente={pending} />
          </>
        )}
      </FormAction>
      {initial && remove ? <div className="flex justify-end"><RemoveContact nombre={initial.nombre} borrar={remove} back={back} /></div> : null}
    </Content>
  )
}
