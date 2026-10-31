'use client'

import type { LucideIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Field } from '@/components/form/field'
import { SectionForm, useSheetForm } from '@/components/form/structure-form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { valueField, type StatusForm } from '@/lib/forms'
import { isVariable, partirVariables, VARIABLES } from '@/lib/templates/variables'
import { cn } from '@/lib/utils'

/** Piezas de las pantallas de alta/edición (docs/diseno/referencias/09-empresa.png y 10-edicion.png). */

export type DefinitionField = {
  campo: string
  label: string
  placeholder?: string
  help?: string
  /** Ocupa las dos columnas. */
  ancho?: boolean
  /** Con filas es un textarea. */
  rows?: number
  props?: React.ComponentProps<typeof Input>
}

/**
 * Tarjeta de un grupo de campos: título y, opcionales, ícono, bajada, acciones a la derecha del título y una franja
 * abajo ("Así sale…"). `compacta` (el editor de cotización, referencia 03) achica el relleno, la separación y el título
 * para que entren más tarjetas en la primera pantalla.
 */
export function Card({
  icon: Icon,
  titulo: title,
  descripcion,
  actions,
  band,
  compacta = false,
  children,
}: {
  icon?: LucideIcon | ((props: { className?: string }) => React.ReactNode)
  titulo: string
  descripcion?: string
  /** Botones chicos a la derecha del título (por ejemplo "Restaurar desde la plantilla"). */
  actions?: React.ReactNode
  band?: React.ReactNode
  /** Cuerpo con p-4 y space-y-3, y título text-base. */
  compacta?: boolean
  children: React.ReactNode
}) {
  const inSheet = useSheetForm()
  if (inSheet) {
    return (
      <SectionForm titulo={title} descripcion={descripcion} actions={actions} band={band} stacked={compacta}>
        {children}
      </SectionForm>
    )
  }
  return (
    <section className="@container overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      <div className={compacta ? 'space-y-3 p-4' : 'space-y-4 p-5 sm:p-6'}>
        <div className={cn('flex gap-3', descripcion ? 'items-start' : 'items-center')}>
          {Icon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className={cn('leading-tight font-medium', compacta ? 'text-base' : 'text-lg')}>{title}</h2>
            {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
          </div>
          {actions ? <div className="-my-1 flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
        {children}
      </div>
      {band ? <div className="space-y-1 border-t bg-muted/60 px-5 py-4 text-sm sm:px-6">{band}</div> : null}
    </section>
  )
}

/** Campos en dos columnas según el ancho de la tarjeta (container query), no de la ventana. */
export function FieldsGrid({
  estado,
  initial,
  fields,
  prefix,
}: {
  estado: StatusForm
  initial?: Partial<Record<string, string | null>>
  fields: DefinitionField[]
  /** Antepone "<prefijo>-" al id de cada campo (el name no cambia). */
  prefix?: string
}) {
  return (
    <div className="grid gap-4 md:gap-y-3 @md:grid-cols-2">
      {fields.map(({ campo: field, label, placeholder, help, ancho, rows, props }) => {
        const id = prefix ? `${prefix}-${field}` : field
        return (
          <Field
            key={field}
            id={id}
            label={label}
            help={help}
            error={estado.errors[field]}
            className={ancho || rows ? '@md:col-span-2' : undefined}
          >
            {rows ? (
              <Textarea
                id={id}
                name={field}
                rows={rows}
                placeholder={placeholder}
                defaultValue={valueField(estado, initial, field)}
                aria-invalid={Boolean(estado.errors[field])}
              />
            ) : (
              <Input
                id={id}
                name={field}
                placeholder={placeholder}
                defaultValue={valueField(estado, initial, field)}
                aria-invalid={Boolean(estado.errors[field])}
                {...props}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}

/** Dato de esta pantalla dentro de una franja "Así sale…". */
export function Highlight({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-sm bg-primary/10 px-0.5 text-inherit">{children}</mark>
}

export function BandView({ icon: Icon, titulo: title, children }: { icon: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <>
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </p>
      {children}
    </>
  )
}

/**
 * Oraciones de plantillas (frasesConVariables) completadas con lo escrito: las variables de `valores` van resaltadas
 * ("—" si están vacías) y las que dependen de cada cotización quedan como "[Horario]".
 */
export function PhrasesResolved({ phrases, values }: { phrases: string[]; values: Partial<Record<string, string>> }) {
  return phrases.map((phrase) => (
    <p key={phrase} className="[overflow-wrap:anywhere]">
      {partirVariables(phrase).map((parte, index) => {
        if (index % 2 === 0) return parte
        if (parte in values) return <Highlight key={index}>{values[parte] || '—'}</Highlight>
        return (
          <span key={index} className="text-muted-foreground">
            [{isVariable(parte) ? VARIABLES[parte] : parte}]
          </span>
        )
      })}
    </p>
  ))
}

/**
 * Valores de algunos campos para las franjas en vivo, recortados como los guardan los esquemas.
 * Va en el contenedor de los campos: <div ref={sincronizar} onInput={alEscribir}>. sincronizar lee el form al montar
 * (el navegador puede restaurar lo escrito al volver con "Atrás" sin disparar input).
 */
export function useViewInLive<C extends string>(fields: readonly C[], initial: Partial<Record<string, string | null>>) {
  const [view, setView] = useState(
    () => Object.fromEntries(fields.map((field) => [field, (initial[field] ?? '').trim()])) as Record<C, string>,
  )

  function onEscribir(evento: React.FormEvent<HTMLElement>) {
    const { name, value } = evento.target as HTMLInputElement
    if ((fields as readonly string[]).includes(name)) setView((preview) => ({ ...preview, [name]: value.trim() }))
  }

  const sincronizar = useCallback(
    (container: HTMLElement | null) => {
      const form = container?.closest('form')
      if (!form) return
      setView(
        Object.fromEntries(
          fields.map((field) => [field, (form.elements.namedItem(field) as HTMLInputElement | null)?.value.trim() ?? '']),
        ) as Record<C, string>,
      )
    },
    // campos es una constante del módulo que llama; no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { view, onEscribir, sincronizar }
}
