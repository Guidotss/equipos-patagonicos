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
import type { Despachar, ErroresBloque } from '@/lib/cotizaciones/editor-pantalla'
import type { Bloque } from '@/lib/plantillas/contenido'
import {
  alternarNegrita,
  alternarVineta,
  bloqueDePlantilla,
  limpiarPegado,
  mismosBloques,
  pegar,
  quitarSangria,
  tramoCambiado,
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

/**
 * Reemplaza la selección del textarea enfocado con insertText, como lo haría el usuario: entra en el historial del
 * textarea (Ctrl/⌘+Z lo deshace) y dispara input, que React toma por onChange. false si el navegador no lo soporta.
 */
function reemplazarSeleccion(reemplazo: string): boolean {
  return reemplazo === '' ? document.execCommand('delete') : document.execCommand('insertText', false, reemplazo)
}

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
  /** El bloque de la plantilla con el mismo título (y número de aparición), si existe. */
  original: Bloque | null
  /** Los errores de guardado de este bloque (por su clave: siguen acá aunque se mueva). */
  errores: ErroresBloque
  despachar: Despachar
}) {
  const numero = indice + 1
  const id = `bloque-${bloque.clave}`
  const nombre = bloque.titulo.trim() || `Bloque ${numero}`
  const area = useRef<HTMLTextAreaElement>(null)
  // Selección a marcar cuando el reducer aplique el texto editado.
  const seleccionPendiente = useRef<Seleccion | null>(null)
  // Al ocultar el foco va a "Mostrar" y al mostrar vuelve a "Ocultar" (cada botón se monta de nuevo). Al subir o bajar,
  // sigue en el botón que se tocó: React mueve el nodo del bloque y el foco se perdería.
  const foco = useRef<'mostrar' | 'ocultar' | 'subir' | 'bajar' | null>(null)
  const botonSubir = useRef<HTMLButtonElement>(null)
  const botonBajar = useRef<HTMLButtonElement>(null)
  const [confirmando, setConfirmando] = useState(false)

  // Un bloque oculto (con "Ocultar" o por una versión nueva del servidor) no deja su confirmación abierta para cuando
  // vuelva a mostrarse.
  if (bloque.oculto && confirmando) setConfirmando(false)

  useLayoutEffect(() => {
    const seleccion = seleccionPendiente.current
    const elemento = area.current
    if (!seleccion || !elemento) return
    seleccionPendiente.current = null
    elemento.focus()
    elemento.setSelectionRange(seleccion.inicio, seleccion.fin)
  }, [bloque.contenido])

  useLayoutEffect(() => {
    const movido = foco.current
    if (movido !== 'subir' && movido !== 'bajar') return
    foco.current = null
    // En la punta, el botón que se tocó queda deshabilitado: el foco pasa al otro del mismo bloque.
    const [tocado, otro] =
      movido === 'subir' ? [botonSubir.current, botonBajar.current] : [botonBajar.current, botonSubir.current]
    const destino = tocado && !tocado.disabled ? tocado : otro
    destino?.focus()
  }, [indice])

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

  /**
   * Aplica una edición de la barra (o Ctrl/⌘+B) con el mismo mecanismo que el pegado: elige el tramo que cambia y lo
   * reemplaza con insertText, así Ctrl/⌘+Z la deshace. Si el navegador no lo soporta, la aplica el reducer.
   */
  function editar(operacion: (texto: string, seleccion: Seleccion) => Edicion) {
    const elemento = area.current
    if (!elemento) return
    const viejo = elemento.value
    const { texto, seleccion } = operacion(viejo, { inicio: elemento.selectionStart, fin: elemento.selectionEnd })
    // Con el teclado, el foco puede estar en el botón de la barra: insertText actúa sobre el elemento enfocado.
    elemento.focus()
    if (texto !== viejo) {
      const tramo = tramoCambiado(viejo, texto)
      elemento.setSelectionRange(tramo.inicio, tramo.fin)
      if (!reemplazarSeleccion(tramo.reemplazo)) {
        seleccionPendiente.current = seleccion
        cambiar({ contenido: texto })
        return
      }
    }
    elemento.setSelectionRange(seleccion.inicio, seleccion.fin)
  }

  function cerrarConfirmacion() {
    setConfirmando(false)
    requestAnimationFrame(() => area.current?.focus())
  }

  const errorTitulo = errores.titulo
  const errorContenido = errores.contenido
  const describir = errorTitulo || errorContenido ? `${id}-error` : undefined
  const puedeRestaurar = original !== null && original.contenido !== bloque.contenido

  if (bloque.oculto) {
    // El nombre accesible es el texto que se ve en la fila.
    const visible = bloque.titulo.trim() || 'Sin título'
    return (
      <article aria-label={visible} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        {/* Con min-w-32 la fila se parte en el celular en vez de achicar el título a nada. */}
        <span className="min-w-32 flex-1 truncate text-[15px] text-muted-foreground">{visible}</span>
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
          ref={botonSubir}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Subir bloque"
          title="Subir bloque"
          disabled={indice === 0}
          onClick={() => {
            foco.current = 'subir'
            despachar({ tipo: 'moverBloque', clave: bloque.clave, direccion: -1 })
          }}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          ref={botonBajar}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Bajar bloque"
          title="Bajar bloque"
          disabled={indice === total - 1}
          onClick={() => {
            foco.current = 'bajar'
            despachar({ tipo: 'moverBloque', clave: bloque.clave, direccion: 1 })
          }}
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
          disabled={confirmando}
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

      {/* Un grupo y no un toolbar: el patrón toolbar pide un solo tab stop y moverse con las flechas. */}
      <div
        role="group"
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
          const limpio = limpiarPegado(pegado)
          // Si no hay nada que limpiar, el pegado nativo.
          if (!pegado || limpio === pegado) return
          evento.preventDefault()
          // insertText conserva Ctrl/⌘+Z (asignar el value por programa lo pierde) y dispara input, que React toma
          // por onChange. Si el navegador no lo soporta, se reemplaza el texto a mano.
          if (!document.execCommand('insertText', false, limpio)) {
            editar((texto, seleccion) => pegar(texto, seleccion, pegado))
          }
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

const SIN_ERRORES: ErroresBloque = {}

export function TarjetaTextos({
  bloques,
  plantilla,
  errores,
  despachar,
}: {
  bloques: BloqueEditor[]
  /** La plantilla de la cotización (también si está inactiva); null si no tiene. */
  plantilla: PlantillaEditor | null
  /** Los errores de guardado de los bloques, por clave de bloque (erroresDeBloques). */
  errores: Record<string, ErroresBloque>
  despachar: Despachar
}) {
  const [confirmando, setConfirmando] = useState(false)
  const botonRestaurar = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const hayQueRestaurar = plantilla !== null && bloques.length > 0 && !mismosBloques(bloques, plantilla.bloques)

  /**
   * Restaurados, los bloques son otros (claves nuevas) y el botón que se tocó ya no está: el foco va al primero, a su
   * título (o a su "Mostrar", si viene oculto), en vez de quedar en el body.
   */
  function restaurarTodos() {
    if (!plantilla) return
    despachar({ tipo: 'restaurarBloques', bloques: plantilla.bloques })
    requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>('input, button')?.focus())
  }

  function cerrar() {
    setConfirmando(false)
    requestAnimationFrame(() => botonRestaurar.current?.focus())
  }

  return (
    <Tarjeta
      compacta
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
            setConfirmando(false)
            restaurarTodos()
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
        <div ref={lista} className="space-y-3">
          {bloques.map((bloque, indice) => (
            <EditorBloque
              key={bloque.clave}
              bloque={bloque}
              indice={indice}
              total={bloques.length}
              original={plantilla ? bloqueDePlantilla(plantilla.bloques, bloques, indice) : null}
              errores={errores[bloque.clave] ?? SIN_ERRORES}
              despachar={despachar}
            />
          ))}
        </div>
      )}
    </Tarjeta>
  )
}
