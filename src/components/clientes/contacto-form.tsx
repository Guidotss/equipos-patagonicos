'use client'

import { ArrowLeft, Printer, Trash2, UserRound } from 'lucide-react'
import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useCallback, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { FranjaVista, Resaltado, Tarjeta, useVistaEnVivo } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoContacto } from '@/lib/clientes/esquemas'
import { iniciales } from '@/lib/format/texto'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

export type Contacto = { nombre: string; cargo: string; email: string; telefono: string }

const CAMPOS: { campo: CampoContacto; etiqueta: string; props?: React.ComponentProps<typeof Input> }[] = [
  { campo: 'nombre', etiqueta: 'Nombre' },
  { campo: 'cargo', etiqueta: 'Cargo' },
  { campo: 'email', etiqueta: 'Email', props: { type: 'email' } },
  { campo: 'telefono', etiqueta: 'Teléfono', props: { type: 'tel' } },
]

const CAMPOS_VISTA = ['nombre', 'email'] as const

/** Como CamposGrilla, pero con los id "contacto-…" de siempre. */
function CamposContacto({ estado, inicial }: { estado: EstadoFormulario; inicial?: Contacto }) {
  return (
    <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
      {CAMPOS.map(({ campo, etiqueta, props }) => {
        const id = `contacto-${campo}`
        const error = estado.errores[campo]
        return (
          <Campo key={campo} id={id} etiqueta={etiqueta} error={error}>
            <Input
              id={id}
              name={campo}
              defaultValue={valorCampo(estado, inicial, campo)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              {...props}
            />
          </Campo>
        )
      })}
    </div>
  )
}

/** El destinatario como lo arma el PDF (src/lib/pdf/cotizacion-mensual.tsx): el email solo si hay. */
function FranjaDestinatario({
  razonSocial,
  vista,
}: {
  razonSocial: string
  vista: Record<(typeof CAMPOS_VISTA)[number], string>
}) {
  return (
    <FranjaVista icono={Printer} titulo="Así sale en la cotización">
      <div className="[overflow-wrap:anywhere]">
        <p>{razonSocial}</p>
        <p>
          Atte. <Resaltado>{vista.nombre || '—'}</Resaltado>
        </p>
        {vista.email ? (
          <p>
            <Resaltado>{vista.email}</Resaltado>
          </p>
        ) : null}
      </div>
      {vista.email ? (
        <p className="pt-1 text-[13px] text-muted-foreground">La cotización por jornada no lleva el email.</p>
      ) : null}
    </FranjaVista>
  )
}

/** Borrar sin modal: el botón pide confirmar en el mismo lugar. */
function BorrarContacto({ nombre, borrar, volver }: { nombre: string; borrar: () => Promise<void>; volver: string }) {
  const router = useRouter()
  const pregunta = useId()
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, iniciarBorrado] = useTransition()
  // El foco va a "Cancelar" al abrir la confirmación y vuelve al botón al cerrarla.
  const devolverFoco = useRef(false)
  const enfocar = useCallback((boton: HTMLButtonElement | null) => boton?.focus(), [])
  const alMontarBoton = useCallback((boton: HTMLButtonElement | null) => {
    if (boton && devolverFoco.current) {
      devolverFoco.current = false
      boton.focus()
    }
  }, [])

  function cancelar() {
    devolverFoco.current = true
    setConfirmando(false)
  }

  function confirmar() {
    iniciarBorrado(async () => {
      try {
        await borrar()
      } catch (error) {
        unstable_rethrow(error)
        toast.error('No se pudo borrar el contacto. Probá de nuevo.')
        return
      }
      toast.success('Contacto borrado')
      // Navegar mientras la acción sigue en curso descarta la re-renderización de esta página (el contacto ya no existe).
      router.push(volver)
    })
  }

  if (!confirmando) {
    return (
      <Button ref={alMontarBoton} type="button" variant="destructive" onClick={() => setConfirmando(true)}>
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
          onClick={confirmar}
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
export function ContactoForm({
  accion,
  clienteId,
  razonSocial,
  inicial,
  borrar,
}: {
  accion: AccionFormulario
  clienteId: string
  razonSocial: string
  inicial?: Contacto
  /** borrarContacto ligado al registro (solo edición). */
  borrar?: () => Promise<void>
}) {
  const router = useRouter()
  const volver = `/clientes/${clienteId}`
  const { vista, alEscribir, sincronizar } = useVistaEnVivo(CAMPOS_VISTA, inicial ?? {})
  const textoGuardar = inicial ? 'Guardar cambios' : 'Guardar contacto'

  const guardar = (pendiente: boolean, props: React.ComponentProps<typeof Button>) => (
    <Button type="submit" size="lg" disabled={pendiente} {...props}>
      {pendiente ? 'Guardando…' : textoGuardar}
    </Button>
  )

  return (
    <FormularioAccion
      accion={accion}
      textoBoton={textoGuardar}
      boton={false}
      alGuardar={() => router.push(volver)}
      encabezado={({ pendiente, formulario }) => (
        <EncabezadoFicha
          titulo={inicial?.nombre || 'Nuevo contacto'}
          recuadro={inicial ? iniciales(inicial.nombre) : <UserRound className="size-10" strokeWidth={1.5} />}
          datos={razonSocial}
          acciones={guardar(pendiente, {
            form: formulario,
            className: 'h-10 px-3.5 text-[15px] shadow-md shadow-primary/20',
          })}
        />
      )}
    >
      {(estado, pendiente) => (
        <Contenido>
          {/* Arriba, cerca de Guardar: los errores generales no tienen un campo donde mostrarse. */}
          <div ref={sincronizar} onInput={alEscribir} className="max-w-2xl space-y-6">
            <MensajeFormulario estado={estado} />
            <Tarjeta
              icono={UserRound}
              titulo="Datos del contacto"
              descripcion="El nombre y el email encabezan la cotización; el cargo y el teléfono no se imprimen."
              franja={<FranjaDestinatario razonSocial={razonSocial} vista={vista} />}
            >
              <CamposContacto estado={estado} inicial={inicial} />
            </Tarjeta>
            {/* En celular el botón de arriba queda lejos después de completar el último campo. */}
            {guardar(pendiente, { className: 'h-10 w-full text-[15px] md:hidden' })}
          </div>
          <div className="flex max-w-2xl flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <Link
              href={volver}
              className="inline-flex items-center gap-1.5 text-[15px] text-primary underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              Volver a {razonSocial}
            </Link>
            {inicial && borrar ? <BorrarContacto nombre={inicial.nombre} borrar={borrar} volver={volver} /> : null}
          </div>
        </Contenido>
      )}
    </FormularioAccion>
  )
}
