'use client'

import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { FieldData } from '@/lib/quotes/data'
import { ID_FIELD, fieldsDataVisible, idFieldData, textNextUpdate, type EditorDispatch } from '@/lib/quotes/editor-screen'
import type { CatalogsEditor, PendingList, StatusEditor } from '@/lib/quotes/editor/types'
import { VARIABLES } from '@/lib/templates/variables'
import { cn } from '@/lib/utils'
import Link from 'next/link'

import { InputDate } from './editor-date-input'
import { SelectorTemplate } from './template-selector'

/** Las mismas clases que la etiqueta de Campo, para los campos que no pueden usarlo (marca superpuesta, selects). */
const LABEL_CLASS = 'text-[13px]/none font-normal text-muted-foreground'
const MISSING_CLASS = '[&_select]:border-brand-yellow [&_select]:bg-brand-yellow/10'

/** Un dato que alimenta una variable. Vacío y usado por el texto: la marca {{x}} encima (nunca como valor). */
function FieldData({
  field,
  value,
  missingComplete,
  error,
  placeholder,
  help,
  dispatch,
}: {
  field: FieldData
  value: string
  missingComplete: boolean
  error?: string
  placeholder?: string
  help?: string
  dispatch: EditorDispatch
}) {
  const id = idFieldData(field)
  const mark = missingComplete && value === ''
  const descriptions =
    [error ? `${id}-error` : null, !error && help ? `${id}-ayuda` : null, mark ? `${id}-falta` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {VARIABLES[field]}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          maxLength={500}
          placeholder={mark ? undefined : placeholder}
          onChange={(event) => dispatch({ tipo: 'dato', campo: field, value: event.target.value })}
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

function HelpEquipment({
  catalogs,
  state,
  missing,
}: {
  catalogs: CatalogsEditor
  state: StatusEditor
  missing: Set<string>
}) {
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
  if (state.equipoId === '') {
    return (
      <p id={`${ID_FIELD.equipo}-ayuda`} className="text-xs text-muted-foreground">
        El texto usa la capacidad y la descripción del equipo.
      </p>
    )
  }
  const data =
    missing.has('capacidad') && missing.has('equipo_descripcion')
      ? 'la capacidad y la descripción'
      : missing.has('capacidad')
        ? 'la capacidad'
        : 'la descripción'
  return (
    <p id={`${ID_FIELD.equipo}-ayuda`} className="text-xs text-muted-foreground">
      Completá {data} del equipo en Configuración › Equipos.
    </p>
  )
}

export function CardData({
  state,
  catalogs,
  pendingList,
  errors,
  dispatch,
}: {
  state: StatusEditor
  catalogs: CatalogsEditor
  pendingList: PendingList
  errors: Record<string, string>
  dispatch: EditorDispatch
}) {
  const missing = new Set<string>(pendingList.variables)
  const missingEquipment = state.equipoId === '' && (missing.has('capacidad') || missing.has('equipo_descripcion'))
  const textNext = textNextUpdate(
    state.proximaActualizacion,
    state.datos.proxima_actualizacion,
    catalogs.empresa.proxima_actualizacion,
  )
  const missingNext = missing.has('proxima_actualizacion') && state.proximaActualizacion === ''
  const nextUpdateError = errors.proximaActualizacion ?? errors['datos.proxima_actualizacion']

  return (
    <Card compacta titulo="Datos de esta cotización">
      {state.id === null ? (
        <SelectorTemplate
          state={state}
          templates={catalogs.plantillas}
          error={errors.templateId ?? errors.formato}
          dispatch={dispatch}
        />
      ) : null}
      <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ID_FIELD.equipo} className={LABEL_CLASS}>
            Equipo
          </Label>
          <NativeSelect
            id={ID_FIELD.equipo}
            value={state.equipoId}
            onChange={(event) => dispatch({ tipo: 'campo', campo: 'equipoId', value: event.target.value })}
            aria-invalid={Boolean(errors.equipoId)}
            aria-describedby={
              errors.equipoId
                ? `${ID_FIELD.equipo}-error`
                : catalogs.equipos.length === 0 || missing.has('capacidad') || missing.has('equipo_descripcion')
                  ? `${ID_FIELD.equipo}-ayuda`
                  : undefined
            }
            // Menos lugar para la flecha: "Grúa telescópica XCMG 70 TN" no se corta contra ella a 1200 px.
            className={cn(
              'w-full [&_[data-slot=native-select-icon]]:right-2 [&_select]:pr-7',
              missingEquipment && MISSING_CLASS,
            )}
          >
            <NativeSelectOption value="">Elegí un equipo</NativeSelectOption>
            {catalogs.equipos.map((equipment) => (
              <NativeSelectOption key={equipment.id} value={equipment.id}>
                {equipment.activo ? equipment.nombre : `${equipment.nombre} (inactivo)`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errors.equipoId ? (
            <p id={`${ID_FIELD.equipo}-error`} className="text-sm text-destructive">
              {errors.equipoId}
            </p>
          ) : (
            <HelpEquipment catalogs={catalogs} state={state} missing={missing} />
          )}
        </div>

        {fieldsDataVisible(state).map((field) => (
          <FieldData
            key={field}
            field={field}
            value={state.datos[field]}
            missingComplete={missing.has(field)}
            error={errors[`datos.${field}`]}
            placeholder={field === 'indice_base' ? catalogs.empresa.indice_base || undefined : undefined}
            help={
              field === 'indice_base' && catalogs.empresa.indice_base ? 'Vacío: se usa el de la empresa.' : undefined
            }
            dispatch={dispatch}
          />
        ))}

        <Field
          id={ID_FIELD.proximaActualizacion}
          label="Próxima actualización"
          error={nextUpdateError}
          help={textNext ? `En el PDF: «${textNext}»` : undefined}
        >
          <Input
            id={ID_FIELD.proximaActualizacion}
            type="month"
            value={state.proximaActualizacion}
            onChange={(event) =>
              dispatch({ tipo: 'campo', campo: 'proximaActualizacion', value: event.target.value })
            }
            aria-invalid={Boolean(nextUpdateError)}
            className={cn(missingNext && 'border-brand-yellow bg-brand-yellow/10')}
          />
        </Field>

        {/* Fecha, validez y firma en una fila de tres (entran a 548 px y ahorran alto). */}
        <div className="grid gap-x-4 gap-y-3 @md:col-span-2 @md:grid-cols-3">
          <Field id={ID_FIELD.fecha} label="Fecha" error={errors.fecha}>
            <InputDate
              id={ID_FIELD.fecha}
              required
              value={state.fecha}
              dispatch={dispatch}
              aria-invalid={Boolean(errors.fecha)}
            />
          </Field>
          <Field id={ID_FIELD.validity} label="Validez (días)" error={errors.validezDias}>
            <Input
              id={ID_FIELD.validity}
              inputMode="numeric"
              value={state.validezDias}
              onChange={(event) => dispatch({ tipo: 'campo', campo: 'validezDias', value: event.target.value })}
              aria-invalid={Boolean(errors.validezDias)}
              className="tabular-nums"
            />
          </Field>
          <div className="space-y-1">
            <Label htmlFor={ID_FIELD.firmante} className={LABEL_CLASS}>
              Firma
            </Label>
            <NativeSelect
              id={ID_FIELD.firmante}
              value={state.firmanteId}
              onChange={(event) => dispatch({ tipo: 'campo', campo: 'firmanteId', value: event.target.value })}
              aria-invalid={Boolean(errors.firmanteId)}
              aria-describedby={errors.firmanteId ? `${ID_FIELD.firmante}-error` : undefined}
              className="w-full"
            >
              <NativeSelectOption value="">Sin firma</NativeSelectOption>
              {catalogs.firmantes.map((signer) => (
                <NativeSelectOption key={signer.id} value={signer.id}>
                  {signer.activo ? signer.nombre : `${signer.nombre} (inactivo)`}
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
