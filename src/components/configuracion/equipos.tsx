'use client'

import { Pencil, Plus } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { Textarea } from '@/components/ui/textarea'
import type { CampoEquipo } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'

export type EquipoConAcciones = {
  id: string
  nombre: string
  capacidad_tn: string
  marca: string
  modelo: string
  identificacion: string
  descripcion: string
  activo: boolean
  actualizar: AccionFormulario
  boton: React.ReactNode
}

/** Grúa sobre camión, con el trazo de lucide (que no trae una). */
export function IconoGrua({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M2 16v-2.5h13V16" />
      <path d="M15 16v-4.5h3.5L21 14v2" />
      <circle cx="5" cy="17.5" r="1.5" />
      <circle cx="9.5" cy="17.5" r="1.5" />
      <circle cx="18" cy="17.5" r="1.5" />
      <path d="M9 13.5v-2.5h3v2.5" />
      <path d="M12 11 4 3.5" />
      <path d="M4 3.5V8" />
      <path d="M4 8a1.25 1.25 0 1 0 1.25 1.25" />
    </svg>
  )
}

function CamposEquipo({ estado, inicial }: { estado: EstadoFormulario; inicial?: Partial<Record<CampoEquipo, string>> }) {
  const campo = (nombre: CampoEquipo, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Campo id={`equipo-${nombre}`} etiqueta={etiqueta} error={estado.errores[nombre]}>
      <Input
        id={`equipo-${nombre}`}
        name={nombre}
        defaultValue={valorCampo(estado, inicial, nombre)}
        aria-invalid={Boolean(estado.errores[nombre])}
        {...props}
      />
    </Campo>
  )
  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <div className="sm:col-span-2">{campo('nombre', 'Nombre')}</div>
      {campo('capacidad_tn', 'Capacidad (TN)', { inputMode: 'decimal' })}
      {campo('identificacion', 'N° interno o dominio')}
      {campo('marca', 'Marca')}
      {campo('modelo', 'Modelo')}
      <Campo
        id="equipo-descripcion"
        etiqueta="Descripción para la cotización"
        error={estado.errores.descripcion}
        ayuda='Es el texto de "Equipo ofrecido".'
        className="sm:col-span-2"
      >
        <Textarea id="equipo-descripcion" name="descripcion" rows={4} defaultValue={valorCampo(estado, inicial, 'descripcion')} />
      </Campo>
    </div>
  )
}

export function NuevoEquipo({ crear }: { crear: AccionFormulario }) {
  return (
    <DialogoFormulario
      titulo="Nuevo equipo"
      accion={crear}
      textoBoton="Guardar equipo"
      disparador={
        <Button size="lg">
          <Plus aria-hidden />
          Nuevo equipo
        </Button>
      }
    >
      {(estado) => <CamposEquipo estado={estado} />}
    </DialogoFormulario>
  )
}

function Dato({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-md bg-muted px-2 text-sm text-foreground/80">{children}</span>
}

export function Equipos({ equipos }: { equipos: EquipoConAcciones[] }) {
  if (equipos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
        Todavía no hay equipos. Agregá el primero con &quot;Nuevo equipo&quot;.
      </p>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
      {equipos.map((equipo) => (
        <li key={equipo.id} className="flex items-start gap-4 p-4 sm:p-5">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-xl sm:size-[72px]',
              equipo.activo ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <IconoGrua className="size-6 stroke-[1.5] sm:size-9" />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-3">
            <div className={cn('min-w-0 flex-1 basis-64 space-y-1.5', equipo.activo ? null : 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-lg font-medium">{equipo.nombre}</p>
                {equipo.capacidad_tn ? <Dato>{equipo.capacidad_tn} TN</Dato> : null}
                {equipo.marca || equipo.modelo ? <Dato>{[equipo.marca, equipo.modelo].filter(Boolean).join(' · ')}</Dato> : null}
                {equipo.identificacion ? <Dato>{equipo.identificacion}</Dato> : null}
              </div>
              {equipo.descripcion ? <p className="max-w-3xl text-[15px] text-foreground/80">{equipo.descripcion}</p> : null}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {equipo.activo ? <Pastilla tono="exito">Activo</Pastilla> : <Pastilla>Inactivo</Pastilla>}
              <DialogoFormulario
                titulo={`Editar ${equipo.nombre}`}
                accion={equipo.actualizar}
                textoBoton="Guardar equipo"
                disparador={
                  <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Editar ${equipo.nombre}`}>
                    <Pencil />
                  </Button>
                }
              >
                {(estado) => <CamposEquipo estado={estado} inicial={equipo} />}
              </DialogoFormulario>
              {equipo.boton}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
