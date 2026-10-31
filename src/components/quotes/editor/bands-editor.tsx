'use client'
// src/components/cotizaciones/editor/franjas-editor.tsx

import { RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  apruebaVersionNoEnviada,
  errorFechaAprobacion,
  esEditable,
  estadoAlRevertir,
  ETIQUETA_EN_CURSO,
  franjasEstado,
  motivoBloqueo,
  pendientesVisibles,
  type Franja,
  type Pendiente,
} from '@/lib/cotizaciones/acciones-estado'
import type { ContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import { MENSAJE_CONFLICTO, type EstadoEditor, type Pendientes } from '@/lib/cotizaciones/editor'
import { cn } from '@/lib/utils'
import type { AccionesEstado } from './acciones-editor'

/** Forma común de las franjas (relev-visual §3.9, como BorrarContacto en contacto-form.tsx). */
const FRANJA = 'rounded-lg border px-4 py-3 text-sm'

const TONO_FRANJA: Record<Franja['tipo'], string> = {
  enviada: 'border-blue-200 bg-blue-50',
  vencida: 'border-amber-200 bg-amber-50',
  aprobada: 'border-green-200 bg-green-50',
  rechazada: 'bg-muted',
  duplicada: 'bg-muted',
}

const ENLACE = 'font-medium text-primary underline-offset-4 hover:underline'

function enfocarCampo(id: string) {
  const campo = document.getElementById(id)
  if (!campo) return
  campo.scrollIntoView({ block: 'center', behavior: 'smooth' })
  campo.focus({ preventScroll: true })
}

/** El texto del botón mientras corre esta acción (otra acción en curso solo deshabilita). */
function textoEnCurso(acciones: AccionesEstado, accion: keyof typeof ETIQUETA_EN_CURSO): string | undefined {
  return acciones.enCurso === accion ? ETIQUETA_EN_CURSO[accion] : undefined
}

function ConfirmarAprobacion({
  estado,
  contexto,
  pendientes,
  acciones,
  hayCambiosSinGuardar,
  hoy,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  acciones: AccionesEstado
  hayCambiosSinGuardar: boolean
  hoy: string
}) {
  // Hoy por defecto; si la cotización tiene fecha futura, su fecha (no se aprueba antes de cotizar).
  const [fecha, setFecha] = useState(hoy < estado.fecha ? estado.fecha : hoy)
  const error = errorFechaAprobacion(fecha, estado.fecha)
  // Lo que falta se vuelve a mirar con la confirmación abierta: si se vacía un campo, Aprobar se deshabilita.
  const bloqueo = motivoBloqueo('aprobar', pendientes)
  const aviso = apruebaVersionNoEnviada(estado, contexto, hayCambiosSinGuardar)
  // Una nueva todavía no tiene número: aprobar la guarda primero (decisión 12).
  const nueva = estado.numero === null

  return (
    <ConfirmacionEnLugar
      tono="exito"
      pregunta={nueva ? '¿Guardar y aprobar la cotización?' : `¿Aprobar la cotización N° ${estado.numero}?`}
      detalle={
        nueva
          ? 'Se guarda con un número nuevo, queda como presupuesto y ya no se modifica.'
          : 'Queda como presupuesto y ya no se modifica.'
      }
      textoConfirmar="Aprobar"
      textoPendiente={textoEnCurso(acciones, 'aprobar')}
      pendiente={acciones.ocupado}
      confirmarDeshabilitado={error !== null || bloqueo !== null}
      alConfirmar={() => void acciones.aprobar(fecha)}
      alCancelar={acciones.cancelar}
    >
      <div className="basis-full space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Label htmlFor="fecha-aprobacion" className="text-[13px] font-normal text-muted-foreground">
            Fecha de aprobación
          </Label>
          <Input
            id="fecha-aprobacion"
            type="date"
            value={fecha}
            min={estado.fecha}
            onChange={(evento) => setFecha(evento.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'fecha-aprobacion-error' : undefined}
            className="h-8 w-40 bg-background"
          />
        </div>
        {error ? (
          <p id="fecha-aprobacion-error" className="text-destructive">
            {error}
          </p>
        ) : null}
        {bloqueo ? <p className="text-destructive">{bloqueo}.</p> : null}
        {aviso ? (
          <p className="flex gap-1.5 text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Se aprueba la versión actual, que el cliente no recibió.
          </p>
        ) : null}
      </div>
    </ConfirmacionEnLugar>
  )
}

function ConfirmacionAbierta({
  estado,
  contexto,
  pendientes,
  acciones,
  hayCambiosSinGuardar,
  hoy,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  acciones: AccionesEstado
  hayCambiosSinGuardar: boolean
  hoy: string
}) {
  const { confirmacion } = acciones
  if (!confirmacion || confirmacion.tipo === 'recargar') return null
  const numero = estado.numero
  const comun = {
    pendiente: acciones.ocupado,
    alCancelar: acciones.cancelar,
    alConfirmar: () => void acciones.confirmar(),
  }

  switch (confirmacion.tipo) {
    case 'aprobar':
      return (
        <ConfirmarAprobacion
          estado={estado}
          contexto={contexto}
          pendientes={pendientes}
          acciones={acciones}
          hayCambiosSinGuardar={hayCambiosSinGuardar}
          hoy={hoy}
        />
      )
    case 'rechazar':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="aviso"
          pregunta={`¿Marcar la cotización N° ${numero} como rechazada?`}
          detalle="Se puede reabrir después."
          textoConfirmar="Rechazar"
          textoPendiente={textoEnCurso(acciones, 'rechazar')}
        />
      )
    case 'reabrir':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="neutro"
          pregunta={`¿Reabrir la cotización N° ${numero}?`}
          detalle="Vuelve a borrador y se puede editar."
          textoConfirmar="Reabrir"
          textoPendiente={textoEnCurso(acciones, 'reabrir')}
        />
      )
    case 'revertir':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="aviso"
          pregunta={`¿Revertir la aprobación de la cotización N° ${numero}?`}
          detalle={`Vuelve a ${estadoAlRevertir(contexto)} y deja de ser un presupuesto. El PDF aprobado queda guardado.`}
          textoConfirmar="Revertir"
          textoPendiente={textoEnCurso(acciones, 'revertir')}
        />
      )
    case 'borrar':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="peligro"
          pregunta={`¿Eliminar el borrador N° ${numero}?`}
          detalle="No se puede deshacer."
          textoConfirmar="Eliminar"
          textoPendiente={textoEnCurso(acciones, 'borrar')}
        />
      )
    case 'duplicar':
      return (
        <ConfirmacionEnLugar
          tono="aviso"
          pregunta="Tenés cambios sin guardar."
          detalle="«Duplicar lo guardado» copia la última versión guardada y descarta estos cambios."
          textoConfirmar="Guardar y duplicar"
          textoPendiente={textoEnCurso(acciones, 'duplicar')}
          alternativa={{ texto: 'Duplicar lo guardado', alElegir: () => void acciones.duplicar(false) }}
          pendiente={acciones.ocupado}
          alConfirmar={() => void acciones.duplicar(true)}
          alCancelar={acciones.cancelar}
        />
      )
    case 'finalizar':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="exito"
          pregunta={`Esta cotización reemplaza a la N° ${confirmacion.anterior.numero}, que sigue en curso como presupuesto.`}
          detalle="Si el trabajo sigue con esta, finalizá el anterior."
          textoConfirmar={`Finalizar el presupuesto N° ${confirmacion.anterior.numero}`}
          textoPendiente={acciones.enCurso === 'finalizar' ? 'Finalizando…' : undefined}
          textoCancelar="Dejarlo en curso"
          alConfirmar={() => void acciones.finalizar()}
        />
      )
  }
}

function FranjaConflicto({ acciones }: { acciones: AccionesEstado }) {
  if (acciones.confirmacion?.tipo === 'recargar') {
    return (
      <ConfirmacionEnLugar
        tono="aviso"
        pregunta="Se descartan los cambios que no guardaste y se carga la versión actual."
        textoConfirmar="Descartar y recargar"
        pendiente={acciones.ocupado}
        alConfirmar={acciones.confirmarRecarga}
        alCancelar={acciones.cancelar}
      />
    )
  }
  return (
    <div role="alert" className={cn(FRANJA, 'flex flex-wrap items-center gap-x-4 gap-y-2 border-amber-200 bg-amber-50')}>
      <p className="flex min-w-0 flex-1 basis-72 gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <span>{MENSAJE_CONFLICTO}. Lo que escribiste sigue acá: recargá para ver la versión actual.</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={acciones.recargar} disabled={acciones.ocupado}>
        <RefreshCw aria-hidden />
        Recargar
      </Button>
    </div>
  )
}

function FranjaPendientes({ faltan, malEscritas }: { faltan: Pendiente[]; malEscritas: string[] }) {
  return (
    <div className={cn(FRANJA, 'flex items-start gap-2.5 border-brand-yellow/60 bg-brand-yellow/10')}>
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-yellow" />
      <div className="space-y-1">
        {faltan.length > 0 ? (
          <p>
            Para enviar falta completar:{' '}
            {faltan.map((pendiente, indice) => {
              const destino = pendiente.destino
              return (
                <Fragment key={pendiente.clave}>
                  {indice > 0 ? ' · ' : null}
                  {destino ? (
                    <button
                      type="button"
                      onClick={() => enfocarCampo(destino)}
                      className="font-semibold underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {pendiente.texto}
                    </button>
                  ) : (
                    <strong className="font-semibold">{pendiente.texto}</strong>
                  )}
                </Fragment>
              )
            })}
          </p>
        ) : null}
        {malEscritas.length > 0 ? (
          <p>
            Hay variables mal escritas en los textos: <strong className="font-semibold">{malEscritas.join(', ')}</strong>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function FranjaDeEstado({ franja, id }: { franja: Franja; id: string | null }) {
  return (
    <div className={cn(FRANJA, TONO_FRANJA[franja.tipo])}>
      {franja.tipo === 'duplicada' ? (
        <p>
          Duplicada de{' '}
          <Link href={`/cotizaciones/${franja.anterior.id}`} className={ENLACE}>
            N° {franja.anterior.numero}
          </Link>
        </p>
      ) : (
        <p>
          {franja.texto}
          {franja.tipo === 'enviada' && franja.envioId && id ? (
            <>
              {' '}
              <a href={`/cotizaciones/${id}/pdf?envio=${franja.envioId}`} target="_blank" rel="noopener" className={ENLACE}>
                Ver lo que recibió el cliente
              </a>
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}

/**
 * Lo que va entre el encabezado y las tarjetas: el conflicto de versión, la confirmación abierta, lo que falta para
 * enviar (franja amarilla, decisión 17) y el estado (enviada, vencida, aprobada, rechazada, duplicada).
 * Una confirmación abierta reemplaza a la franja de estado (salvo la de duplicada y la oferta de finalizar).
 */
export function FranjasEditor({
  estado,
  contexto,
  pendientes,
  acciones,
  hayCambiosSinGuardar,
  hoy,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  acciones: AccionesEstado
  hayCambiosSinGuardar: boolean
  /** Hoy en Argentina ('YYYY-MM-DD'), del servidor: la fecha de aprobación por defecto. */
  hoy: string
}) {
  const { faltan, malEscritas } = pendientesVisibles(pendientes, estado)
  const conPendientes = esEditable(estado) && (faltan.length > 0 || malEscritas.length > 0)
  const tipo = acciones.confirmacion?.tipo
  const confirmando = tipo !== undefined && tipo !== 'recargar' && tipo !== 'finalizar'
  const franjas = franjasEstado(estado, contexto).filter((franja) => !confirmando || franja.tipo === 'duplicada')

  if (!acciones.conflicto && !acciones.confirmacion && !conPendientes && franjas.length === 0) return null

  return (
    <div className="space-y-3">
      {acciones.conflicto || tipo === 'recargar' ? <FranjaConflicto acciones={acciones} /> : null}
      <ConfirmacionAbierta
        estado={estado}
        contexto={contexto}
        pendientes={pendientes}
        acciones={acciones}
        hayCambiosSinGuardar={hayCambiosSinGuardar}
        hoy={hoy}
      />
      {conPendientes ? <FranjaPendientes faltan={faltan} malEscritas={malEscritas} /> : null}
      {franjas.map((franja) => (
        <FranjaDeEstado key={franja.tipo} franja={franja} id={estado.id} />
      ))}
    </div>
  )
}
