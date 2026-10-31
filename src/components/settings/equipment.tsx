'use client'

import { PanelsLeftBottom, Pencil, Plus, Printer, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Content } from '@/components/app-shell/header'
import { Field } from '@/components/form/field'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { FormAction } from '@/components/form/form-action'
import { MessageForm } from '@/components/form/message-form'
import { BandView, PhrasesResolved, Card, useViewInLive } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pill } from '@/components/ui/pill'
import { Textarea } from '@/components/ui/textarea'
import type { FieldEquipment } from '@/lib/catalogs/schemas'
import { valueField, type ActionForm, type StatusForm } from '@/lib/forms'
import { cn } from '@/lib/utils'
import { IconCrane } from './icon-crane'

/** Un equipo con la capacidad ya como texto ("60,5"). */
export type Equipment = {
  id: string
  nombre: string
  capacidad_tn: string
  marca: string
  modelo: string
  identificacion: string
  descripcion: string
  activo: boolean
}

const LISTA = '/configuracion/equipos'

type DefinitionField = { campo: FieldEquipment; label: string; ancho?: boolean; props?: React.ComponentProps<typeof Input> }

const FIELDS_DATA: DefinitionField[] = [
  { campo: 'nombre', label: 'Nombre', ancho: true },
  { campo: 'capacidad_tn', label: 'Capacidad (TN)', props: { inputMode: 'decimal' } },
  { campo: 'identificacion', label: 'N° interno o dominio' },
  { campo: 'marca', label: 'Marca' },
  { campo: 'modelo', label: 'Modelo' },
]

const FIELDS_VIEW = ['capacidad_tn', 'descripcion'] as const

type Initial = Partial<Record<FieldEquipment, string>>

function Data({ activo, className, children }: { activo: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-slate-200/70 px-2 text-sm',
        activo ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

function PillStatus({ activo }: { activo: boolean }) {
  return activo ? <Pill tone="exito">Activo</Pill> : <Pill>Inactivo</Pill>
}

/** Capacidad y marca · modelo, como chips. */
function dataKey(equipo: Equipment): string[] {
  return [
    equipo.capacidad_tn ? `${equipo.capacidad_tn} TN` : '',
    [equipo.marca, equipo.modelo].filter(Boolean).join(' · '),
  ].filter(Boolean)
}

function FieldsData({ estado, initial }: { estado: StatusForm; initial: Initial }) {
  return (
    <div className="grid gap-x-4 gap-y-3 @sm:grid-cols-2">
      {FIELDS_DATA.map(({ campo: field, label, ancho, props }) => (
        <Field
          key={field}
          id={`equipo-${field}`}
          label={label}
          error={estado.errors[field]}
          className={ancho ? '@sm:col-span-2' : undefined}
        >
          <Input
            id={`equipo-${field}`}
            name={field}
            defaultValue={valueField(estado, initial, field)}
            aria-invalid={Boolean(estado.errors[field])}
            {...props}
          />
        </Field>
      ))}
    </div>
  )
}

/** Alta (sin equipo) o edición de un equipo en pantalla propia. */
export function FormEquipment({
  accion,
  equipo,
  buttonStatus,
  phrases,
}: {
  accion: ActionForm
  equipo?: Equipment
  /** Activar/Desactivar, solo en edición. */
  buttonStatus?: React.ReactNode
  /** Oraciones de las plantillas activas con {{capacidad}} o {{equipo_descripcion}}. */
  phrases: string[]
}) {
  const router = useRouter()
  const initial: Initial = equipo ?? {}
  const { view, onEscribir, sincronizar } = useViewInLive(FIELDS_VIEW, initial)
  const textSave = equipo ? 'Guardar cambios' : 'Guardar equipo'
  const chips = equipo ? dataKey(equipo) : []

  return (
    <FormAction
      accion={accion}
      textButton={textSave}
      button={false}
      onSave={() => router.push(LISTA)}
      header={() => (
        <Content className="max-w-6xl pb-0">
          <HeaderForm
            titulo={equipo?.nombre || 'Nuevo equipo'}
            estado={equipo ? <PillStatus activo={equipo.activo} /> : null}
            descripcion={chips.length > 0 ? chips.join(' · ') : 'Datos del equipo y descripción que se usa al cotizar.'}
            actions={buttonStatus}
          />
        </Content>
      )}
    >
      {(estado, pending) => (
        <Content className="max-w-6xl pt-6 pb-28">
          <MessageForm estado={estado} />
          <SheetForm ref={sincronizar} onInput={onEscribir}>
            <Card
              icon={PanelsLeftBottom}
              titulo="Datos del equipo"
              descripcion="Identifican la grúa en las listas y en el combo de la cotización."
            >
              <FieldsData estado={estado} initial={initial} />
            </Card>
            <Card
              icon={StickyNote}
              titulo="Texto para la cotización"
              descripcion="Es el texto de “Equipo ofrecido”."
              band={
                phrases.length > 0 ? (
                  <BandView icon={Printer} titulo="Así sale en la cotización">
                    <PhrasesResolved
                      phrases={phrases}
                      values={{ capacidad: view.capacidad_tn, equipo_descripcion: view.descripcion }}
                    />
                  </BandView>
                ) : null
              }
            >
              <Field id="equipo-descripcion" label="Descripción para la cotización" error={estado.errors.descripcion}>
                <Textarea
                  id="equipo-descripcion"
                  name="descripcion"
                  defaultValue={valueField(estado, initial, 'descripcion')}
                  aria-invalid={Boolean(estado.errors.descripcion)}
                  className="min-h-56"
                />
              </Field>
            </Card>
          </SheetForm>
          <ActionsForm back={LISTA} textButton={textSave} pendiente={pending} />
        </Content>
      )}
    </FormAction>
  )
}

export function NewEquipment() {
  return (
    <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
      <Link href={`${LISTA}/nuevo`}>
        <Plus aria-hidden />
        Nuevo equipo
      </Link>
    </Button>
  )
}

export function Equipment({ equipos }: { equipos: (Equipment & { button: React.ReactNode })[] }) {
  if (equipos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
        Todavía no hay equipos. Agregá el primero con &quot;Nuevo equipo&quot;.
      </p>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      {equipos.map((equipo) => (
        <li key={equipo.id} className="flex items-start gap-4 p-4 sm:p-5">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-xl sm:size-[72px]',
              equipo.activo ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <IconCrane className="size-6 stroke-[1.5] sm:size-9" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 basis-56 space-y-1.5">
                <p className={cn('text-lg font-medium', equipo.activo ? null : 'text-muted-foreground')}>{equipo.nombre}</p>
                {equipo.capacidad_tn || equipo.marca || equipo.modelo || equipo.identificacion ? (
                  <div className="flex flex-wrap gap-1.5">
                    {[...dataKey(equipo), equipo.identificacion].filter(Boolean).map((data, index) => (
                      <Data key={index} activo={equipo.activo}>
                        {data}
                      </Data>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <PillStatus activo={equipo.activo} />
                <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                  <Link href={`${LISTA}/${equipo.id}`} aria-label={`Editar ${equipo.nombre}`}>
                    <Pencil />
                  </Link>
                </Button>
                {equipo.button}
              </div>
            </div>
            {equipo.descripcion ? (
              <p className={cn('mt-2 max-w-3xl text-[15px]', equipo.activo ? 'text-foreground/80' : 'text-muted-foreground')}>
                {equipo.descripcion}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
