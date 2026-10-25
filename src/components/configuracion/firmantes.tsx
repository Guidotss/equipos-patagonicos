'use client'

import { ArrowLeft, Pencil, PenLine, Plus, Printer, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { CamposGrilla, FranjaVista, Resaltado, Tarjeta, useVistaEnVivo, type DefinicionCampo } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Pastilla } from '@/components/ui/pastilla'
import type { CampoFirmante } from '@/lib/catalogos/esquemas'
import { iniciales } from '@/lib/format/texto'
import type { AccionFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'

const LISTA = '/configuracion/firmantes'

export type Firmante = {
  id: string
  nombre: string
  cargo: string
  telefono: string
  email: string
  activo: boolean
}

export type FirmanteConAcciones = Firmante & { boton: React.ReactNode }

// En el orden en que los imprime Firma (src/lib/pdf/comunes.tsx); el email va último porque no se imprime.
const CAMPOS: (DefinicionCampo & { campo: CampoFirmante })[] = [
  { campo: 'nombre', etiqueta: 'Nombre', ancho: true },
  { campo: 'cargo', etiqueta: 'Cargo' },
  { campo: 'telefono', etiqueta: 'Teléfono', props: { type: 'tel' } },
  { campo: 'email', etiqueta: 'Email', ancho: true, props: { type: 'email' } },
]

const CAMPOS_VISTA = ['nombre', 'cargo', 'telefono'] as const

/** La firma como la arma el PDF: una línea por dato y sin las vacías, salvo el nombre. */
function FranjaFirma({ vista }: { vista: Record<(typeof CAMPOS_VISTA)[number], string> }) {
  return (
    <FranjaVista icono={Printer} titulo="Así firma la cotización">
      <div className="[overflow-wrap:anywhere]">
        <p>
          <Resaltado>{vista.nombre || '—'}</Resaltado>
        </p>
        {vista.cargo ? (
          <p>
            <Resaltado>{vista.cargo}</Resaltado>
          </p>
        ) : null}
        {vista.telefono ? (
          <p>
            <Resaltado>{vista.telefono}</Resaltado>
          </p>
        ) : null}
      </div>
    </FranjaVista>
  )
}

/** Alta y edición de un firmante en pantalla propia. Sin `inicial` es un alta. */
export function FirmanteForm({
  accion,
  inicial,
  botonEstado,
}: {
  accion: AccionFormulario
  inicial?: Firmante
  /** Activar/Desactivar, ligado al registro en el servidor (solo edición). */
  botonEstado?: React.ReactNode
}) {
  const router = useRouter()
  const valores = inicial ? { nombre: inicial.nombre, cargo: inicial.cargo, telefono: inicial.telefono, email: inicial.email } : {}
  const { vista, alEscribir, sincronizar } = useVistaEnVivo(CAMPOS_VISTA, valores)
  const textoGuardar = inicial ? 'Guardar cambios' : 'Guardar firmante'
  const datosClave = inicial ? [inicial.cargo, inicial.telefono, inicial.email].filter(Boolean).join(' · ') : ''
  const pastilla = !inicial ? null : inicial.activo ? <Pastilla tono="exito">Activo</Pastilla> : <Pastilla>Inactivo</Pastilla>

  return (
    <FormularioAccion
      accion={accion}
      textoBoton={textoGuardar}
      boton={false}
      alGuardar={() => router.push(LISTA)}
      encabezado={({ pendiente, formulario }) => (
        <EncabezadoFicha
          titulo={inicial?.nombre || 'Nuevo firmante'}
          recuadro={inicial ? iniciales(inicial.nombre) : <PenLine className="size-10" strokeWidth={1.5} />}
          estado={pastilla}
          datos={datosClave || null}
          acciones={
            <>
              {botonEstado}
              <Button
                type="submit"
                form={formulario}
                size="lg"
                className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20"
                disabled={pendiente}
              >
                {pendiente ? 'Guardando…' : textoGuardar}
              </Button>
            </>
          }
        />
      )}
    >
      {(estado, pendiente) => (
        <Contenido>
          <div ref={sincronizar} onInput={alEscribir} className="max-w-2xl space-y-6">
            {/* Arriba, cerca de Guardar: los errores generales no tienen un campo donde mostrarse. */}
            <MensajeFormulario estado={estado} />
            <Tarjeta
              icono={UserRound}
              titulo="Datos del firmante"
              descripcion="El nombre, el cargo y el teléfono cierran cada cotización; el email no se imprime."
              franja={<FranjaFirma vista={vista} />}
            >
              <CamposGrilla estado={estado} inicial={valores} campos={CAMPOS} prefijo="firmante" />
            </Tarjeta>
            {/* En celular el botón de arriba queda lejos después de completar el último campo. */}
            <Button type="submit" size="lg" className="h-10 w-full text-[15px] md:hidden" disabled={pendiente}>
              {pendiente ? 'Guardando…' : textoGuardar}
            </Button>
          </div>
          <Link
            href={LISTA}
            className="inline-flex items-center gap-1.5 text-[15px] text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Volver a Firmantes
          </Link>
        </Contenido>
      )}
    </FormularioAccion>
  )
}

export function NuevoFirmante() {
  return (
    <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
      <Link href={`${LISTA}/nuevo`}>
        <Plus aria-hidden />
        Nuevo firmante
      </Link>
    </Button>
  )
}

export function Firmantes({ firmantes }: { firmantes: FirmanteConAcciones[] }) {
  if (firmantes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
        Todavía no hay firmantes. Agregá el primero con &quot;Nuevo firmante&quot;.
      </p>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      {firmantes.map((firmante) => (
        <li key={firmante.id} className="flex items-center gap-4 p-4 sm:p-5">
          <span
            aria-hidden
            className={cn(
              'grid size-10 shrink-0 place-items-center self-start rounded-full text-sm font-semibold sm:size-12 sm:self-center sm:text-[15px]',
              firmante.activo ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            {iniciales(firmante.nombre)}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className={cn('text-lg font-medium', firmante.activo ? null : 'text-muted-foreground')}>{firmante.nombre}</p>
              <p
                className={cn(
                  'flex flex-wrap gap-x-3 text-[15px]',
                  firmante.activo ? 'text-foreground/80' : 'text-muted-foreground',
                )}
              >
                {firmante.cargo ? <span>{firmante.cargo}</span> : null}
                {firmante.telefono ? <span className="tabular-nums">{firmante.telefono}</span> : null}
                {firmante.email ? <span className="min-w-0 [overflow-wrap:anywhere]">{firmante.email}</span> : null}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {firmante.activo ? <Pastilla tono="exito">Activo</Pastilla> : <Pastilla>Inactivo</Pastilla>}
              <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                <Link href={`${LISTA}/${firmante.id}`} aria-label={`Editar a ${firmante.nombre}`}>
                  <Pencil />
                </Link>
              </Button>
              {firmante.boton}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
