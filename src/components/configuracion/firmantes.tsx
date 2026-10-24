'use client'

import { Pencil, Plus } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import type { CampoFirmante } from '@/lib/catalogos/esquemas'
import { iniciales } from '@/lib/format/texto'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'

export type FirmanteConAcciones = {
  id: string
  nombre: string
  cargo: string
  telefono: string
  email: string
  activo: boolean
  actualizar: AccionFormulario
  boton: React.ReactNode
}

function CamposFirmante({ estado, inicial }: { estado: EstadoFormulario; inicial?: Partial<Record<CampoFirmante, string>> }) {
  const campo = (nombre: CampoFirmante, etiqueta: string) => (
    <Campo id={`firmante-${nombre}`} etiqueta={etiqueta} error={estado.errores[nombre]}>
      <Input
        id={`firmante-${nombre}`}
        name={nombre}
        defaultValue={valorCampo(estado, inicial, nombre)}
        aria-invalid={Boolean(estado.errores[nombre])}
      />
    </Campo>
  )
  return (
    <div className="space-y-3">
      {campo('nombre', 'Nombre')}
      {campo('cargo', 'Cargo')}
      {campo('telefono', 'Teléfono')}
      {campo('email', 'Email')}
    </div>
  )
}

export function NuevoFirmante({ crear }: { crear: AccionFormulario }) {
  return (
    <DialogoFormulario
      titulo="Nuevo firmante"
      accion={crear}
      textoBoton="Guardar firmante"
      disparador={
        <Button size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
          <Plus aria-hidden />
          Nuevo firmante
        </Button>
      }
    >
      {(estado) => <CamposFirmante estado={estado} />}
    </DialogoFormulario>
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
              <DialogoFormulario
                titulo={`Editar a ${firmante.nombre}`}
                accion={firmante.actualizar}
                textoBoton="Guardar firmante"
                disparador={
                  <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Editar a ${firmante.nombre}`}>
                    <Pencil />
                  </Button>
                }
              >
                {(estado) => <CamposFirmante estado={estado} inicial={firmante} />}
              </DialogoFormulario>
              {firmante.boton}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
