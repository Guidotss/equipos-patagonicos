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
import { IconoGrua } from './icono-grua'

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
        <Button size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
          <Plus aria-hidden />
          Nuevo equipo
        </Button>
      }
    >
      {(estado) => <CamposEquipo estado={estado} />}
    </DialogoFormulario>
  )
}

function Dato({ activo, children }: { activo: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-slate-200/70 px-2 text-sm',
        activo ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
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
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 basis-56 space-y-1.5">
                <p className={cn('text-lg font-medium', equipo.activo ? null : 'text-muted-foreground')}>{equipo.nombre}</p>
                {equipo.capacidad_tn || equipo.marca || equipo.modelo || equipo.identificacion ? (
                  <div className="flex flex-wrap gap-1.5">
                    {equipo.capacidad_tn ? <Dato activo={equipo.activo}>{equipo.capacidad_tn} TN</Dato> : null}
                    {equipo.marca || equipo.modelo ? (
                      <Dato activo={equipo.activo}>{[equipo.marca, equipo.modelo].filter(Boolean).join(' · ')}</Dato>
                    ) : null}
                    {equipo.identificacion ? <Dato activo={equipo.activo}>{equipo.identificacion}</Dato> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
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
            {equipo.descripcion ? (
              <p className={cn('mt-2 max-w-3xl text-[15px]', equipo.activo ? 'text-foreground/80' : 'text-muted-foreground')}>
                {equipo.descripcion}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
