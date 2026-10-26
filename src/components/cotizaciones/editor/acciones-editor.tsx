'use client'
// src/components/cotizaciones/editor/acciones-editor.tsx

import { Ellipsis, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import * as acciones from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  disposicionAcciones,
  esConfirmable,
  esConflicto,
  esEditable,
  ETIQUETA_ACCION,
  ETIQUETA_EN_CURSO,
  fechaHoraDeMarca,
  motivoBloqueo,
  type AccionConfirmable,
  type AccionEstado,
  type BotonAccion,
} from '@/lib/cotizaciones/acciones-estado'
import type { ContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import type { EstadoEditor, Pendientes } from '@/lib/cotizaciones/editor'
import { cn } from '@/lib/utils'

export type Confirmacion =
  | { tipo: AccionConfirmable }
  | { tipo: 'recargar' }
  | { tipo: 'finalizar'; anterior: { id: string; numero: number } }

/** Qué hace el editor cuando llega la versión nueva del servidor: tomarla (después de una transición) o descartar lo local (Recargar). */
export type EsperaServidor = 'adoptar' | 'descartar'

/** Lo que devuelve el guardar del editor (VersionGuardada de la Task 8). */
export type CotizacionGuardada = { id: string; version: string; numero: number }

export type AccionesEstado = {
  /** La acción que corre (la `accion` del editor: 'guardar' o una de estas). */
  enCurso: string | null
  /** Corre una acción (o una recarga): todos los botones de acción quedan deshabilitados (decisión 12). */
  ocupado: boolean
  confirmacion: Confirmacion | null
  conflicto: boolean
  iniciar: (accion: AccionEstado) => void
  cancelar: () => void
  aprobar: (fecha: string) => Promise<void>
  /** Confirma rechazar, reabrir, revertir o eliminar. */
  confirmar: () => Promise<void>
  finalizar: () => Promise<void>
  recargar: () => void
  confirmarRecarga: () => void
}

/** Descarga sin navegar (el atributo download evita salir del editor): el nombre lo pone la ruta del PDF. */
export function descargarArchivo(url: string) {
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
}

const EXITO = {
  rechazar: 'Cotización rechazada',
  reabrir: 'Cotización reabierta',
  revertir: 'Se revirtió la aprobación',
} as const

function confirmacionInicial(
  accion: AccionConfirmable | null | undefined,
  estado: EstadoEditor,
  contexto: ContextoEstado,
  pendientes: Pendientes,
): Confirmacion | null {
  if (!accion) return null
  const { botones, menu } = disposicionAcciones(estado, contexto)
  const disponible = botones.some((boton) => boton.accion === accion) || menu.includes(accion)
  return disponible && motivoBloqueo(accion, pendientes) === null ? { tipo: accion } : null
}

/**
 * Las acciones de estado del editor: guardar antes si hace falta, correr la transición con la versión que vio la
 * pantalla, confirmar en el lugar y ofrecer "Recargar" ante un conflicto de versión (decisiones 11 a 15).
 */
export function useAccionesEstado({
  estado,
  contexto,
  pendientes,
  hayCambiosSinGuardar,
  guardar,
  accion,
  setAccion,
  conflicto,
  setConflicto,
  esperarServidor,
  accionInicial,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  hayCambiosSinGuardar: boolean
  /**
   * El guardar del editor (Task 8): guarda si hay cambios y devuelve la versión (la actual si no había nada que
   * guardar); null si no se pudo (ya lo mostró) o si la cotización no se edita. Con `navegar: false`, una nueva se
   * crea sin ir a su página.
   */
  guardar: (opciones?: { navegar?: boolean }) => Promise<CotizacionGuardada | null>
  /** La acción en curso del editor (Task 8): con una en curso se deshabilitan todos los botones. */
  accion: string | null
  setAccion: (accion: string | null) => void
  conflicto: boolean
  setConflicto: (conflicto: boolean) => void
  /** Avisa al editor que tome la próxima versión del servidor (null: ya no la espera). */
  esperarServidor: (modo: EsperaServidor | null, versionLocal?: string | null) => void
  /** ?accion= de la URL: abre esa confirmación al entrar. */
  accionInicial?: AccionConfirmable | null
}): AccionesEstado {
  const router = useRouter()
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(() =>
    confirmacionInicial(accionInicial, estado, contexto, pendientes),
  )
  const [recargando, iniciarRecarga] = useTransition()
  const disparador = useRef<HTMLElement | null>(null)

  // El ?accion= ya se usó: se saca de la URL para que recargar la página no vuelva a abrir la confirmación.
  useEffect(() => {
    if (accionInicial) window.history.replaceState(null, '', window.location.pathname)
  }, [accionInicial])

  function abrir(nueva: Confirmacion) {
    disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmacion(nueva)
  }

  function cancelar() {
    const volver = disparador.current
    disparador.current = null
    setConfirmacion(null)
    // El foco vuelve al botón que abrió la confirmación, si sigue en pantalla.
    requestAnimationFrame(() => {
      if (volver?.isConnected) volver.focus()
    })
  }

  function fallo(mensaje: string) {
    if (esConflicto(mensaje)) {
      setConfirmacion(null)
      setConflicto(true)
    } else {
      toast.error(mensaje)
    }
  }

  /**
   * Guarda lo que haya sin guardar y devuelve el id y la versión con los que seguir (null si no se pudo). Una nueva
   * se guarda sin navegar (decisión 12): la transición usa el id que vuelve y después se va a su página. `guardar()`
   * deja la acción del editor en null al terminar: se vuelve a marcar la que sigue corriendo.
   */
  async function versionParaSeguir(propia: string): Promise<{ id: string; version: string } | null> {
    if (!hayCambiosSinGuardar && estado.id && estado.version) return { id: estado.id, version: estado.version }
    const guardada = await guardar({ navegar: false })
    setAccion(propia)
    return guardada ? { id: guardada.id, version: guardada.version } : null
  }

  /**
   * Una nueva se guardó sin navegar para seguir con la transición: al terminar (también si la transición falló, ya
   * quedó guardada) va a su página, que arma el editor con lo que hay en la base. Una existente solo se refresca.
   */
  function despuesDeLaTransicion(id: string, eraNueva: boolean, salioBien: boolean) {
    if (eraNueva) router.replace(`/cotizaciones/${id}`)
    else if (salioBien) router.refresh()
  }

  async function enviar(accion: 'enviar' | 'reenviar') {
    const eraNueva = estado.id === null
    setAccion(accion)
    try {
      const guardada = await versionParaSeguir(accion)
      if (!guardada) return
      const { id, version } = guardada
      esperarServidor('adoptar', version)
      const resultado = await acciones.enviarCotizacion(id, version)
      if (!resultado.ok) {
        esperarServidor(null)
        fallo(resultado.mensaje)
        return despuesDeLaTransicion(id, eraNueva, false)
      }
      descargarArchivo(`/cotizaciones/${id}/pdf?envio=${resultado.datos.envioId}&descargar=1`)
      toast.success('Se descargó el PDF y la cotización quedó enviada')
      despuesDeLaTransicion(id, eraNueva, true)
    } finally {
      setAccion(null)
    }
  }

  async function duplicar() {
    const id = estado.id
    if (!id) return
    setAccion('duplicar')
    try {
      // Se duplica lo guardado: los cambios se guardan antes para no perderlos al salir del editor.
      if (hayCambiosSinGuardar && esEditable(estado) && !(await versionParaSeguir('duplicar'))) return
      const resultado = await acciones.duplicarCotizacion(id)
      if (!resultado.ok) return fallo(resultado.mensaje)
      toast.success('Se creó una copia en borrador')
      router.push(`/cotizaciones/${resultado.datos.id}`)
    } finally {
      setAccion(null)
    }
  }

  function iniciar(accion: AccionEstado) {
    if (esConfirmable(accion)) return abrir({ tipo: accion })
    if (accion === 'enviar' || accion === 'reenviar') return void enviar(accion)
    if (accion === 'duplicar') return void duplicar()
    if (accion === 'descargar' && estado.id) descargarArchivo(`/cotizaciones/${estado.id}/pdf?descargar=1`)
  }

  async function aprobar(fecha: string) {
    const eraNueva = estado.id === null
    setAccion('aprobar')
    try {
      const guardada = await versionParaSeguir('aprobar')
      if (!guardada) return
      const { id, version } = guardada
      esperarServidor('adoptar', version)
      const resultado = await acciones.aprobarCotizacion(id, version, fecha)
      if (!resultado.ok) {
        esperarServidor(null)
        fallo(resultado.mensaje)
        return despuesDeLaTransicion(id, eraNueva, false)
      }
      toast.success('Cotización aprobada')
      // Una renegociación: se ofrece cerrar el presupuesto que esta reemplaza (decisión 14). Una nueva no reemplaza a
      // ninguna (reemplaza_a solo lo pone duplicar), así que navegar no pierde la oferta.
      const { anterior } = resultado.datos
      setConfirmacion(anterior ? { tipo: 'finalizar', anterior } : null)
      despuesDeLaTransicion(id, eraNueva, true)
    } finally {
      setAccion(null)
    }
  }

  async function confirmar() {
    const id = estado.id
    const tipo = confirmacion?.tipo
    if (!id || (tipo !== 'rechazar' && tipo !== 'reabrir' && tipo !== 'revertir' && tipo !== 'borrar')) return
    setAccion(tipo)
    try {
      if (tipo === 'borrar') {
        const resultado = await acciones.borrarCotizacion(id)
        if (!resultado.ok) return fallo(resultado.mensaje)
        toast.success(`Se eliminó el borrador N° ${estado.numero}`)
        router.push('/cotizaciones')
        return
      }
      // Una rechazada no se edita: lo que no se guardó se guarda antes de rechazar para no perderlo.
      const version = tipo === 'rechazar' ? (await versionParaSeguir('rechazar'))?.version : estado.version
      if (!version) return
      esperarServidor('adoptar', version)
      const resultado =
        tipo === 'rechazar'
          ? await acciones.rechazarCotizacion(id)
          : tipo === 'reabrir'
            ? await acciones.reabrirCotizacion(id)
            : await acciones.revertirAprobacion(id)
      if (!resultado.ok) {
        esperarServidor(null)
        return fallo(resultado.mensaje)
      }
      setConfirmacion(null)
      toast.success(EXITO[tipo])
      router.refresh()
    } finally {
      setAccion(null)
    }
  }

  async function finalizar() {
    if (confirmacion?.tipo !== 'finalizar') return
    const { anterior } = confirmacion
    setAccion('finalizar')
    try {
      const resultado = await acciones.finalizarPresupuesto(anterior.id)
      if (!resultado.ok) return fallo(resultado.mensaje)
      setConfirmacion(null)
      toast.success(`Se finalizó el presupuesto N° ${anterior.numero}`)
    } finally {
      setAccion(null)
    }
  }

  function confirmarRecarga() {
    esperarServidor('descartar', estado.version)
    setConfirmacion(null)
    setConflicto(false)
    iniciarRecarga(() => router.refresh())
  }

  function recargar() {
    if (hayCambiosSinGuardar) return abrir({ tipo: 'recargar' })
    confirmarRecarga()
  }

  return {
    enCurso: accion,
    ocupado: accion !== null || recargando,
    confirmacion,
    conflicto,
    iniciar,
    cancelar,
    aprobar,
    confirmar,
    finalizar,
    recargar,
    confirmarRecarga,
  }
}

/** Primario de cabecera; con la barra inferior a la vista (< 72rem) se ve como outline: el primario ahí es Guardar. */
const PRIMARIO = 'shadow-md shadow-primary/20'
const PRIMARIO_CON_BARRA = cn(
  PRIMARIO,
  'max-[72rem]:border-border max-[72rem]:bg-background max-[72rem]:text-foreground max-[72rem]:shadow-none max-[72rem]:hover:bg-muted',
)

function BotonDeAccion({
  boton,
  estado,
  pendientes,
  acciones: accionesEstado,
  className,
}: {
  boton: BotonAccion
  estado: EstadoEditor
  pendientes: Pendientes
  acciones: AccionesEstado
  /** Visibilidad según el ancho (va en el elemento de afuera). */
  className?: string
}) {
  const { accion, primaria } = boton
  const variante = primaria ? 'default' : 'outline'
  const estilo = primaria ? (esEditable(estado) ? PRIMARIO_CON_BARRA : PRIMARIO) : undefined

  if (accion === 'descargar') {
    if (!estado.id) return null
    return (
      <Button asChild variant={variante} size="lg" className={cn(estilo, className)}>
        <a href={`/cotizaciones/${estado.id}/pdf?descargar=1`} download>
          {ETIQUETA_ACCION.descargar}
        </a>
      </Button>
    )
  }

  const bloqueo = motivoBloqueo(accion, pendientes)
  const elemento = (
    <Button
      type="button"
      variant={variante}
      size="lg"
      className={cn(estilo, bloqueo ? undefined : className)}
      disabled={accionesEstado.ocupado || bloqueo !== null}
      onClick={() => accionesEstado.iniciar(accion)}
    >
      {accionesEstado.enCurso === accion ? ETIQUETA_EN_CURSO[accion] : ETIQUETA_ACCION[accion]}
    </Button>
  )
  // Un botón deshabilitado no recibe el puntero: el motivo va en el title de un envoltorio.
  return bloqueo ? (
    <span title={bloqueo} className={cn('inline-flex', className)}>
      {elemento}
    </span>
  ) : (
    elemento
  )
}

/**
 * Los botones de estado del encabezado del editor, a la derecha de Guardar (que dibuja EncabezadoEditor), según el
 * estado (relev-visual §3.2), con el menú ⋯ y el historial de envíos. En el celular los secundarios pasan al menú.
 */
export function AccionesEncabezado({
  estado,
  contexto,
  pendientes,
  acciones: accionesEstado,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  acciones: AccionesEstado
}) {
  const botonMenu = useRef<HTMLButtonElement>(null)
  /** La confirmación que eligió un ítem del menú: se abre cuando el menú terminó de cerrarse (onCloseAutoFocus). */
  const pendiente = useRef<AccionEstado | null>(null)
  const { botones, menu } = disposicionAcciones(estado, contexto)
  const secundarias = botones.filter((boton) => !boton.primaria).map((boton) => boton.accion)
  const id = estado.id
  const enMenu: { accion: AccionEstado; soloCelular: boolean }[] = [
    ...secundarias.map((accion) => ({ accion, soloCelular: true })),
    ...menu.map((accion) => ({ accion, soloCelular: false })),
  ]
  // Sin acciones propias ni envíos, el menú solo tiene lo que en escritorio ya está a la vista.
  const menuSoloCelular = menu.length === 0 && contexto.envios.length === 0

  return (
    <>
      {botones.map((boton) => (
        <BotonDeAccion
          key={boton.accion}
          boton={boton}
          estado={estado}
          pendientes={pendientes}
          acciones={accionesEstado}
          className={boton.primaria ? undefined : 'hidden md:inline-flex'}
        />
      ))}
      {id && enMenu.length + contexto.envios.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={botonMenu}
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Más acciones"
              disabled={accionesEstado.ocupado}
              className={menuSoloCelular ? 'md:hidden' : undefined}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-auto min-w-56"
            onCloseAutoFocus={(evento) => {
              const accion = pendiente.current
              if (!accion) return
              pendiente.current = null
              // Recién acá el FocusScope del menú (modal) ya no atrapa el foco: abrir la confirmación en onSelect
              // dejaría el foco en el ítem y después en body. El foco pasa por el ⋯ (adonde vuelve al cancelar) y, con
              // el render de la confirmación, queda en su "Cancelar" (decisión 15).
              evento.preventDefault()
              botonMenu.current?.focus()
              accionesEstado.iniciar(accion)
            }}
          >
            {enMenu.map(({ accion, soloCelular }) =>
              accion === 'descargar' ? (
                <DropdownMenuItem key={accion} asChild className={soloCelular ? 'md:hidden' : undefined}>
                  <a href={`/cotizaciones/${id}/pdf?descargar=1`} download>
                    {ETIQUETA_ACCION.descargar}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  key={accion}
                  className={soloCelular ? 'md:hidden' : undefined}
                  variant={accion === 'borrar' ? 'destructive' : 'default'}
                  disabled={motivoBloqueo(accion, pendientes) !== null}
                  onSelect={() => {
                    // Una confirmación se abre cuando el menú se cerró del todo (ver onCloseAutoFocus).
                    if (esConfirmable(accion)) pendiente.current = accion
                    else accionesEstado.iniciar(accion)
                  }}
                >
                  {ETIQUETA_ACCION[accion]}
                </DropdownMenuItem>
              ),
            )}
            {contexto.envios.length > 0 ? (
              <>
                {enMenu.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Envíos (lo que recibió el cliente)
                </DropdownMenuLabel>
                {contexto.envios.map((envio, indice) => (
                  <DropdownMenuItem key={envio.id} asChild>
                    <a href={`/cotizaciones/${id}/pdf?envio=${envio.id}`} target="_blank" rel="noopener">
                      <FileText aria-hidden />
                      {fechaHoraDeMarca(envio.enviada_at)}
                      {indice === 0 ? ' · último' : ''}
                    </a>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
