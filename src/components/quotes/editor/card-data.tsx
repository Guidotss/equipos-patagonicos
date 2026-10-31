'use client'
// src/components/cotizaciones/editor/tarjeta-datos.tsx

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Field } from '@/components/form/field'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Card } from '@/components/form/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { FieldData } from '@/lib/quotes/data'
import type { CatalogsEditor, StatusEditor, PendingList, TemplateEditor } from '@/lib/quotes/editor'
import {
  ID_FIELD,
  changesOfContent,
  fieldsDataVisible,
  isDateIso,
  idFieldData,
  templatesOfFormat,
  textNextUpdate,
  type Despachar,
} from '@/lib/quotes/editor-screen'
import { FORMATOS, type Format } from '@/lib/templates/content'
import { VARIABLES } from '@/lib/templates/variables'
import { cn } from '@/lib/utils'

/** Las mismas clases que la etiqueta de Campo, para los campos que no pueden usarlo (marca superpuesta, selects). */
const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'
const FALTA = '[&_select]:border-brand-yellow [&_select]:bg-brand-yellow/10'

function SelectorTemplate({
  estado,
  plantillas,
  error,
  despachar,
}: {
  estado: StatusEditor
  plantillas: TemplateEditor[]
  error?: string
  despachar: Despachar
}) {
  const [pending, setPending] = useState<TemplateEditor | null>(null)
  const grupo = useRef<HTMLDivElement>(null)
  const actual = plantillas.find((template) => template.id === estado.templateId) ?? null
  const ofFormat = templatesOfFormat(plantillas, estado.formato)

  function choose(template: TemplateEditor | undefined) {
    if (!template || template.id === estado.templateId) return
    if (changesOfContent(estado, actual)) setPending(template)
    else despachar({ tipo: 'plantilla', plantilla: template })
  }

  // Al cerrar la confirmación el foco vuelve a la opción elegida (después del render).
  function cerrar() {
    setPending(null)
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLElement>('[data-state="on"]')?.focus())
  }

  if (plantillas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay plantillas activas.{' '}
        <Link href="/configuracion/plantillas" className="text-primary underline-offset-4 hover:underline">
          Revisalas en Configuración
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Un valor vacío es "deseleccionar" (Radix): el formato siempre queda elegido. */}
        <ToggleGroup
          ref={grupo}
          type="single"
          aria-label="Formato"
          value={estado.formato}
          onValueChange={(value) => {
            if (value) choose(templatesOfFormat(plantillas, value as Format)[0])
          }}
          className="h-8 gap-0 rounded-lg bg-muted p-0.5"
        >
          {(Object.keys(FORMATOS) as Format[]).map((formato) => (
            <ToggleGroupItem
              key={formato}
              value={formato}
              disabled={templatesOfFormat(plantillas, formato).length === 0}
              className="h-7 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {FORMATOS[formato]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {ofFormat.length > 1 ? (
          <NativeSelect
            id={ID_FIELD.plantilla}
            aria-label="Plantilla"
            value={estado.templateId}
            onChange={(evento) => choose(plantillas.find((template) => template.id === evento.target.value))}
            className="min-w-0 flex-1"
          >
            {ofFormat.map((template) => (
              <NativeSelectOption key={template.id} value={template.id}>
                {template.nombre}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pending ? (
        <ConfirmationInLugar
          tone="aviso"
          pregunta={`¿Cambiar a la plantilla «${pending.nombre}»?`}
          detail="Se reemplazan el asunto, la introducción, los textos y los ítems."
          textConfirm="Cambiar plantilla"
          onConfirm={() => {
            despachar({ tipo: 'plantilla', plantilla: pending })
            cerrar()
          }}
          onCancelar={cerrar}
        />
      ) : null}
    </div>
  )
}

/** Un dato que alimenta una variable. Vacío y usado por el texto: la marca {{x}} encima (nunca como valor). */
function FieldData({
  campo: field,
  value,
  missingComplete,
  error,
  placeholder,
  help,
  despachar,
}: {
  campo: FieldData
  value: string
  missingComplete: boolean
  error?: string
  placeholder?: string
  help?: string
  despachar: Despachar
}) {
  const id = idFieldData(field)
  const mark = missingComplete && value === ''
  const descriptions =
    [error ? `${id}-error` : null, !error && help ? `${id}-ayuda` : null, mark ? `${id}-falta` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={ETIQUETA}>
        {VARIABLES[field]}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          maxLength={500}
          placeholder={mark ? undefined : placeholder}
          onChange={(evento) => despachar({ tipo: 'dato', campo: field, value: evento.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptions}
        />
        {mark ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 rounded-sm bg-brand-yellow/40 px-0.5 text-sm"
            >
              {`{{${field}}}`}
            </span>
            <span id={`${id}-falta`} className="sr-only">
              Falta completar: lo usa el texto de la cotización.
            </span>
          </>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}

function HelpEquipment({ catalogs, estado, missing }: { catalogs: CatalogsEditor; estado: StatusEditor; missing: Set<string> }) {
  if (catalogs.equipos.length === 0) {
    return (
      <p id={`${ID_FIELD.equipo}-ayuda`} className="text-xs text-muted-foreground">
        No hay equipos activos.{' '}
        <Link href="/configuracion/equipos/nuevo" className="text-primary underline-offset-4 hover:underline">
          Cargar equipos en Configuración
        </Link>
      </p>
    )
  }
  if (!missing.has('capacidad') && !missing.has('equipo_descripcion')) return null
  if (estado.equipoId === '') {
    return <p id={`${ID_FIELD.equipo}-ayuda`} className="text-xs text-muted-foreground">El texto usa la capacidad y la descripción del equipo.</p>
  }
  const datos = missing.has('capacidad') && missing.has('equipo_descripcion')
    ? 'la capacidad y la descripción'
    : missing.has('capacidad') ? 'la capacidad' : 'la descripción'
  return (
    <p id={`${ID_FIELD.equipo}-ayuda`} className="text-xs text-muted-foreground">
      Completá {datos} del equipo en Configuración › Equipos.
    </p>
  )
}

/** Una fecha que se puede despachar: existe y su año tiene cuatro cifras (0202 es "2027" a medio escribir). */
function dateComplete(value: string): boolean {
  return isDateIso(value) && !value.startsWith('0')
}

type PropsInputDate = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'onBlur'> & {
  value: string
  despachar: Despachar
}

/**
 * La fecha, con un borrador propio. Al tipear el año, Chrome pasa por 0002, 0020 y 0202: como esas fechas a medio
 * escribir no se despachan (el documento no se puede armar sin fecha), un input atado al estado volvería a la fecha
 * anterior en cada tecla y el año no se podría tipear. El input muestra el borrador; se despacha solo una fecha
 * completa y, al salir del campo, lo que no llegó a serlo vuelve a la fecha del estado.
 */
function InputDate({ value, despachar, ...props }: PropsInputDate) {
  const [draft, setDraft] = useState({ de: value, texto: value })
  // Si la fecha cambia desde afuera (recargar, la fecha recién despachada), el borrador la sigue.
  if (draft.de !== value) setDraft({ de: value, texto: value })

  return (
    <Input
      {...props}
      type="date"
      value={draft.texto}
      onChange={(evento) => {
        const texto = evento.target.value
        setDraft({ de: value, texto })
        if (dateComplete(texto) && texto !== value) despachar({ tipo: 'campo', campo: 'fecha', value: texto })
      }}
      onBlur={() => {
        if (draft.texto !== value) setDraft({ de: value, texto: value })
      }}
    />
  )
}

export function CardData({
  estado,
  catalogs,
  pendingList,
  errors,
  despachar,
}: {
  estado: StatusEditor
  catalogs: CatalogsEditor
  pendingList: PendingList
  errors: Record<string, string>
  despachar: Despachar
}) {
  const missing = new Set<string>(pendingList.variables)
  const missingEquipment = estado.equipoId === '' && (missing.has('capacidad') || missing.has('equipo_descripcion'))
  const textNext = textNextUpdate(
    estado.proximaActualizacion,
    estado.datos.proxima_actualizacion,
    catalogs.empresa.proxima_actualizacion,
  )
  const missingNext = missing.has('proxima_actualizacion') && estado.proximaActualizacion === ''
  const errorNext = errors.proximaActualizacion ?? errors['datos.proxima_actualizacion']

  return (
    <Card compacta titulo="Datos de esta cotización">
      {estado.id === null ? (
        <SelectorTemplate
          estado={estado}
          plantillas={catalogs.plantillas}
          error={errors.templateId ?? errors.formato}
          despachar={despachar}
        />
      ) : null}
      <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ID_FIELD.equipo} className={ETIQUETA}>
            Equipo
          </Label>
          <NativeSelect
            id={ID_FIELD.equipo}
            value={estado.equipoId}
            onChange={(evento) => despachar({ tipo: 'campo', campo: 'equipoId', value: evento.target.value })}
            aria-invalid={Boolean(errors.equipoId)}
            aria-describedby={errors.equipoId
              ? `${ID_FIELD.equipo}-error`
              : catalogs.equipos.length === 0 || missing.has('capacidad') || missing.has('equipo_descripcion')
                ? `${ID_FIELD.equipo}-ayuda`
                : undefined}
            // Menos lugar para la flecha: "Grúa telescópica XCMG 70 TN" no se corta contra ella a 1200 px.
            className={cn(
              'w-full [&_[data-slot=native-select-icon]]:right-2 [&_select]:pr-7',
              missingEquipment && FALTA,
            )}
          >
            <NativeSelectOption value="">Elegí un equipo</NativeSelectOption>
            {catalogs.equipos.map((equipo) => (
              <NativeSelectOption key={equipo.id} value={equipo.id}>
                {equipo.activo ? equipo.nombre : `${equipo.nombre} (inactivo)`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errors.equipoId ? (
            <p id={`${ID_FIELD.equipo}-error`} className="text-sm text-destructive">
              {errors.equipoId}
            </p>
          ) : (
            <HelpEquipment catalogs={catalogs} estado={estado} missing={missing} />
          )}
        </div>

        {fieldsDataVisible(estado).map((field) => (
          <FieldData
            key={field}
            campo={field}
            value={estado.datos[field]}
            missingComplete={missing.has(field)}
            error={errors[`datos.${field}`]}
            placeholder={field === 'indice_base' ? catalogs.empresa.indice_base || undefined : undefined}
            help={
              field === 'indice_base' && catalogs.empresa.indice_base
                ? 'Vacío: se usa el de la empresa.'
                : undefined
            }
            despachar={despachar}
          />
        ))}

        <Field
          id={ID_FIELD.proximaActualizacion}
          label="Próxima actualización"
          error={errorNext}
          help={textNext ? `En el PDF: «${textNext}»` : undefined}
        >
          <Input
            id={ID_FIELD.proximaActualizacion}
            type="month"
            value={estado.proximaActualizacion}
            onChange={(evento) =>
              despachar({ tipo: 'campo', campo: 'proximaActualizacion', value: evento.target.value })
            }
            aria-invalid={Boolean(errorNext)}
            className={cn(missingNext && 'border-brand-yellow bg-brand-yellow/10')}
          />
        </Field>

        {/* Fecha, validez y firma en una fila de tres (entran a 548 px y ahorran alto). */}
        <div className="grid gap-x-4 gap-y-3 @md:col-span-2 @md:grid-cols-3">
          <Field id={ID_FIELD.fecha} label="Fecha" error={errors.fecha}>
            <InputDate
              id={ID_FIELD.fecha}
              required
              value={estado.fecha}
              despachar={despachar}
              aria-invalid={Boolean(errors.fecha)}
            />
          </Field>
          <Field id={ID_FIELD.validity} label="Validez (días)" error={errors.validezDias}>
            <Input
              id={ID_FIELD.validity}
              inputMode="numeric"
              value={estado.validezDias}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'validezDias', value: evento.target.value })}
              aria-invalid={Boolean(errors.validezDias)}
              className="tabular-nums"
            />
          </Field>
          <div className="space-y-1">
            <Label htmlFor={ID_FIELD.firmante} className={ETIQUETA}>
              Firma
            </Label>
            <NativeSelect
              id={ID_FIELD.firmante}
              value={estado.firmanteId}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'firmanteId', value: evento.target.value })}
              aria-invalid={Boolean(errors.firmanteId)}
              aria-describedby={errors.firmanteId ? `${ID_FIELD.firmante}-error` : undefined}
              className="w-full"
            >
              <NativeSelectOption value="">Sin firma</NativeSelectOption>
              {catalogs.firmantes.map((firmante) => (
                <NativeSelectOption key={firmante.id} value={firmante.id}>
                  {firmante.activo ? firmante.nombre : `${firmante.nombre} (inactivo)`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errors.firmanteId ? (
              <p id={`${ID_FIELD.firmante}-error`} className="text-sm text-destructive">
                {errors.firmanteId}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
