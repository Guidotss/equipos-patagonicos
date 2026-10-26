'use client'

import type { LucideIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Campo } from '@/components/formulario/campo'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { valorCampo, type EstadoFormulario } from '@/lib/formularios'
import { esVariable, partirVariables, VARIABLES } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

/** Piezas de las pantallas de alta/edición (docs/diseno/referencias/09-empresa.png y 10-edicion.png). */

export type DefinicionCampo = {
  campo: string
  etiqueta: string
  placeholder?: string
  ayuda?: string
  /** Ocupa las dos columnas. */
  ancho?: boolean
  /** Con filas es un textarea. */
  filas?: number
  props?: React.ComponentProps<typeof Input>
}

/**
 * Tarjeta de un grupo de campos: título y, opcionales, ícono, bajada, acciones a la derecha del título y una franja
 * abajo ("Así sale…"). Sin ícono ni bajada es la tarjeta compacta del editor de cotización.
 */
export function Tarjeta({
  icono: Icono,
  titulo,
  descripcion,
  acciones,
  franja,
  children,
}: {
  icono?: LucideIcon | ((props: { className?: string }) => React.ReactNode)
  titulo: string
  descripcion?: string
  /** Botones chicos a la derecha del título (por ejemplo "Restaurar desde la plantilla"). */
  acciones?: React.ReactNode
  franja?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="@container overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      <div className="space-y-4 p-5 sm:p-6">
        <div className={cn('flex gap-3', descripcion ? 'items-start' : 'items-center')}>
          {Icono ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
              <Icono className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="text-lg leading-tight font-medium">{titulo}</h2>
            {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
          </div>
          {acciones ? <div className="-my-1 flex shrink-0 items-center gap-1">{acciones}</div> : null}
        </div>
        {children}
      </div>
      {franja ? <div className="space-y-1 border-t bg-muted/60 px-5 py-4 text-sm sm:px-6">{franja}</div> : null}
    </section>
  )
}

/** Campos en dos columnas según el ancho de la tarjeta (container query), no de la ventana. */
export function CamposGrilla({
  estado,
  inicial,
  campos,
  prefijo,
}: {
  estado: EstadoFormulario
  inicial?: Partial<Record<string, string | null>>
  campos: DefinicionCampo[]
  /** Antepone "<prefijo>-" al id de cada campo (el name no cambia). */
  prefijo?: string
}) {
  return (
    <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
      {campos.map(({ campo, etiqueta, placeholder, ayuda, ancho, filas, props }) => {
        const id = prefijo ? `${prefijo}-${campo}` : campo
        return (
          <Campo
            key={campo}
            id={id}
            etiqueta={etiqueta}
            ayuda={ayuda}
            error={estado.errores[campo]}
            className={ancho || filas ? '@md:col-span-2' : undefined}
          >
            {filas ? (
              <Textarea
                id={id}
                name={campo}
                rows={filas}
                placeholder={placeholder}
                defaultValue={valorCampo(estado, inicial, campo)}
                aria-invalid={Boolean(estado.errores[campo])}
              />
            ) : (
              <Input
                id={id}
                name={campo}
                placeholder={placeholder}
                defaultValue={valorCampo(estado, inicial, campo)}
                aria-invalid={Boolean(estado.errores[campo])}
                {...props}
              />
            )}
          </Campo>
        )
      })}
    </div>
  )
}

/** Dato de esta pantalla dentro de una franja "Así sale…". */
export function Resaltado({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-sm bg-primary/10 px-0.5 text-inherit">{children}</mark>
}

export function FranjaVista({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <>
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <Icono className="size-3.5" aria-hidden />
        {titulo}
      </p>
      {children}
    </>
  )
}

/**
 * Oraciones de plantillas (frasesConVariables) completadas con lo escrito: las variables de `valores` van resaltadas
 * ("—" si están vacías) y las que dependen de cada cotización quedan como "[Horario]".
 */
export function FrasesResueltas({ frases, valores }: { frases: string[]; valores: Partial<Record<string, string>> }) {
  return frases.map((frase) => (
    <p key={frase} className="[overflow-wrap:anywhere]">
      {partirVariables(frase).map((parte, indice) => {
        if (indice % 2 === 0) return parte
        if (parte in valores) return <Resaltado key={indice}>{valores[parte] || '—'}</Resaltado>
        return (
          <span key={indice} className="text-muted-foreground">
            [{esVariable(parte) ? VARIABLES[parte] : parte}]
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
export function useVistaEnVivo<C extends string>(campos: readonly C[], inicial: Partial<Record<string, string | null>>) {
  const [vista, setVista] = useState(
    () => Object.fromEntries(campos.map((campo) => [campo, (inicial[campo] ?? '').trim()])) as Record<C, string>,
  )

  function alEscribir(evento: React.FormEvent<HTMLElement>) {
    const { name, value } = evento.target as HTMLInputElement
    if ((campos as readonly string[]).includes(name)) setVista((previa) => ({ ...previa, [name]: value.trim() }))
  }

  const sincronizar = useCallback(
    (contenedor: HTMLElement | null) => {
      const form = contenedor?.closest('form')
      if (!form) return
      setVista(
        Object.fromEntries(
          campos.map((campo) => [campo, (form.elements.namedItem(campo) as HTMLInputElement | null)?.value.trim() ?? '']),
        ) as Record<C, string>,
      )
    },
    // campos es una constante del módulo que llama; no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { vista, alEscribir, sincronizar }
}
