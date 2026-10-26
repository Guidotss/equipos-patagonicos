'use client'
// src/components/cotizaciones/editor/tarjeta-textos.tsx

import {
  ArrowDown,
  ArrowUp,
  Bold,
  Eye,
  EyeOff,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { Textarea } from '@/components/ui/textarea'
import type { BloqueEditor, PlantillaEditor } from '@/lib/cotizaciones/editor'
import type { Despachar } from '@/lib/cotizaciones/editor-pantalla'
import type { Bloque } from '@/lib/plantillas/contenido'
import {
  alternarNegrita,
  alternarVineta,
  bloqueDePlantilla,
  mismosBloques,
  pegar,
  quitarSangria,
  type Edicion,
  type Seleccion,
} from '@/lib/plantillas/edicion'

type Herramienta = {
  etiqueta: string
  atajo?: string
  Icono: LucideIcon
  aplicar: (texto: string, seleccion: Seleccion) => Edicion
}

/** Solo lo que entiende parsearFormato y dibuja el PDF (decisión 5): sin itálica ni lista numerada. */
const HERRAMIENTAS: Herramienta[] = [
  { etiqueta: 'Negrita', atajo: 'Ctrl+B', Icono: Bold, aplicar: alternarNegrita },
  { etiqueta: 'Viñeta', Icono: List, aplicar: (texto, seleccion) => alternarVineta(texto, seleccion, 1) },
  { etiqueta: 'Subviñeta', Icono: ListIndentIncrease, aplicar: (texto, seleccion) => alternarVineta(texto, seleccion, 2) },
  { etiqueta: 'Quitar sangría', Icono: ListIndentDecrease, aplicar: quitarSangria },
]

const ICONO = 'text-muted-foreground'

function EditorBloque({
  bloque,
  indice,
  total,
  original,
  errores,
  despachar,
}: {
  bloque: BloqueEditor
  indice: number
  total: number
  /** El bloque de la plantilla con el mismo título, si existe. */
  original: Bloque | null
  errores: Record<string, string>
  despachar: Despachar
}) {
  const numero = indice + 1
  const id = `bloque-${bloque.clave}`
  const nombre = bloque.titulo.trim() || `Bloque ${numero}`
  const area = useRef<HTMLTextAreaElement>(null)
  // Selección a marcar cuando el reducer aplique el texto editado.
  const seleccionPendiente = useRef<Seleccion | null>(null)
  // Al ocultar el foco va a "Mostrar" y al mostrar vuelve a "Ocultar" (cada botón se monta de nuevo).
  const foco = useRef<'mostrar' | 'ocultar' | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  useLayoutEffect(() => {
    const seleccion = seleccionPendiente.current
    const elemento = area.current
    if (!seleccion || !elemento) return
    seleccionPendiente.current = null
    elemento.focus()
    elemento.setSelectionRange(seleccion.inicio, seleccion.fin)
  }, [bloque.contenido])

  const alMontarMostrar = useCallback((boton: HTMLButtonElement | null) => {
    if (boton && foco.current === 'mostrar') {
      foco.current = null
      boton.focus()
    }
  }, [])
  const alMontarOcultar = useCallback((boton: HTMLButtonElement | null) => {
    if (boton && foco.current === 'ocultar') {
      foco.current = null
      boton.focus()
    }
  }, [])

  const cambiar = (cambios: Partial<Omit<BloqueEditor, 'clave'>>) =>
    despachar({ tipo: 'bloque', clave: bloque.clave, cambios })

  function editar(operacion: (texto: string, seleccion: Seleccion) => Edicion) {
    const elemento = area.current
    if (!elemento) return
    const { texto, seleccion } = operacion(elemento.value, {
      inicio: elemento.selectionStart,
      fin: elemento.selectionEnd,
    })
    if (texto === bloque.contenido) {
      elemento.focus()
      elemento.setSelectionRange(seleccion.inicio, seleccion.fin)
      return
    }
    seleccionPendiente.current = seleccion
    cambiar({ contenido: texto })
  }

  function cerrarConfirmacion() {
    setConfirmando(false)
    requestAnimationFrame(() => area.current?.focus())
  }

  const errorTitulo = errores[`bloques.${indice}.titulo`]
  const errorContenido = errores[`bloques.${indice}.contenido`]
  const describir = errorTitulo || errorContenido ? `${id}-error` : undefined
  const puedeRestaurar = original !== null && original.contenido !== bloque.contenido

  if (bloque.oculto) {
    return (
      <article aria-label={nombre} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        {/* Con min-w-32 la fila se parte en el celular en vez de achicar el título a nada. */}
        <span className="min-w-32 flex-1 truncate text-[15px] text-muted-foreground">
          {bloque.titulo.trim() || 'Sin título'}
        </span>
        <Pastilla>Oculto en esta cotización</Pastilla>
        <Button
          ref={alMontarMostrar}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            foco.current = 'ocultar'
            cambiar({ oculto: false })
          }}
        >
          <Eye aria-hidden />
          Mostrar
        </Button>
      </article>
    )
  }

  return (
    <article
      aria-label={nombre}
      className="overflow-hidden rounded-lg border transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input
          id={`${id}-titulo`}
          aria-label={`Título del bloque ${numero}`}
          value={bloque.titulo}
          placeholder="Sin título"
          onChange={(evento) => cambiar({ titulo: evento.target.value })}
          aria-invalid={Boolean(errorTitulo)}
          aria-describedby={describir}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-[15px] font-medium shadow-none hover:border-input focus-visible:border-ring focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Subir bloque"
          title="Subir bloque"
          disabled={indice === 0}
          onClick={() => despachar({ tipo: 'moverBloque', clave: bloque.clave, direccion: -1 })}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Bajar bloque"
          title="Bajar bloque"
          disabled={indice === total - 1}
          onClick={() => despachar({ tipo: 'moverBloque', clave: bloque.clave, direccion: 1 })}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          ref={alMontarOcultar}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Ocultar en esta cotización"
          title="Ocultar en esta cotización (no sale en el PDF)"
          onClick={() => {
            foco.current = 'mostrar'
            cambiar({ oculto: true })
          }}
        >
          <EyeOff aria-hidden />
        </Button>
        {puedeRestaurar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={ICONO}
            aria-label="Restaurar este bloque"
            title="Restaurar este bloque desde la plantilla"
            disabled={confirmando}
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </div>

      {confirmando && original ? (
        <ConfirmacionEnLugar
          className="m-2"
          tono="aviso"
          pregunta="¿Restaurar este bloque desde la plantilla?"
          detalle="Se pierden los cambios hechos en su texto."
          textoConfirmar="Restaurar"
          alConfirmar={() => {
            cambiar({ titulo: original.titulo, contenido: original.contenido, oculto: false })
            cerrarConfirmacion()
          }}
          alCancelar={cerrarConfirmacion}
        />
      ) : null}

      <div
        role="toolbar"
        aria-label={`Formato del bloque ${numero}`}
        aria-controls={`${id}-contenido`}
        className="flex gap-0.5 border-b bg-muted/30 px-1.5 py-1"
      >
        {HERRAMIENTAS.map(({ etiqueta, atajo, Icono, aplicar }) => (
          <Button
            key={etiqueta}
            type="button"
            variant="ghost"
            size="icon-sm"
            className={ICONO}
            aria-label={etiqueta}
            title={atajo ? `${etiqueta} (${atajo})` : etiqueta}
            // Sin esto el clic le saca el foco y la selección al texto.
            onMouseDown={(evento) => evento.preventDefault()}
            onClick={() => editar(aplicar)}
          >
            <Icono aria-hidden />
          </Button>
        ))}
      </div>

      <Textarea
        ref={area}
        id={`${id}-contenido`}
        aria-label={`Contenido del bloque ${numero}`}
        value={bloque.contenido}
        placeholder="Texto del bloque"
        onChange={(evento) => cambiar({ contenido: evento.target.value })}
        onKeyDown={(evento) => {
          if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === 'b') {
            evento.preventDefault()
            editar(alternarNegrita)
          }
        }}
        // Lo pegado desde Word llega como texto plano, pero con sus viñetas y tabs: se lleva al formato mínimo.
        onPaste={(evento) => {
          const pegado = evento.clipboardData.getData('text/plain')
          if (!pegado) return
          evento.preventDefault()
          editar((texto, seleccion) => pegar(texto, seleccion, pegado))
        }}
        aria-invalid={Boolean(errorContenido)}
        aria-describedby={describir}
        className="min-h-20 resize-none rounded-none border-0 px-3 py-2.5 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
      />
      {describir ? (
        <p id={describir} className="border-t px-3 py-2 text-sm text-destructive">
          {[errorTitulo, errorContenido].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </article>
  )
}

export function TarjetaTextos({
  bloques,
  plantilla,
  errores,
  despachar,
}: {
  bloques: BloqueEditor[]
  /** La plantilla de la cotización (también si está inactiva); null si no tiene. */
  plantilla: PlantillaEditor | null
  errores: Record<string, string>
  despachar: Despachar
}) {
  const [confirmando, setConfirmando] = useState(false)
  const botonRestaurar = useRef<HTMLButtonElement>(null)
  const hayQueRestaurar = plantilla !== null && bloques.length > 0 && !mismosBloques(bloques, plantilla.bloques)

  function restaurarTodos() {
    if (plantilla) despachar({ tipo: 'restaurarBloques', bloques: plantilla.bloques })
  }

  function cerrar() {
    setConfirmando(false)
    requestAnimationFrame(() => botonRestaurar.current?.focus())
  }

  return (
    <Tarjeta
      titulo="Textos"
      acciones={
        hayQueRestaurar ? (
          <Button
            ref={botonRestaurar}
            type="button"
            variant="ghost"
            size="sm"
            className={ICONO}
            disabled={confirmando}
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw aria-hidden />
            Restaurar desde la plantilla
          </Button>
        ) : null
      }
    >
      {confirmando && plantilla ? (
        <ConfirmacionEnLugar
          tono="aviso"
          pregunta={`¿Restaurar todos los textos desde «${plantilla.nombre}»?`}
          detalle="Se pierden los cambios hechos en los textos de esta cotización, también los bloques ocultos."
          textoConfirmar="Restaurar"
          alConfirmar={() => {
            restaurarTodos()
            cerrar()
          }}
          alCancelar={cerrar}
        />
      ) : null}
      {bloques.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-6">
          <p className="flex-1 text-[15px] text-muted-foreground">Esta cotización no tiene textos.</p>
          {plantilla && plantilla.bloques.length > 0 ? (
            // Sin textos no hay nada que perder: restaura sin confirmar.
            <Button type="button" variant="outline" size="sm" onClick={restaurarTodos}>
              <RotateCcw aria-hidden />
              Restaurar desde la plantilla
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {bloques.map((bloque, indice) => (
            <EditorBloque
              key={bloque.clave}
              bloque={bloque}
              indice={indice}
              total={bloques.length}
              original={plantilla ? bloqueDePlantilla(plantilla.bloques, bloque.titulo) : null}
              errores={errores}
              despachar={despachar}
            />
          ))}
        </div>
      )}
    </Tarjeta>
  )
}
