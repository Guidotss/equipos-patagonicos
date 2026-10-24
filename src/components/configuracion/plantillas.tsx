'use client'

import { FileText, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'

export type PlantillaConAcciones = {
  id: string
  nombre: string
  formato: string
  activa: boolean
  renombrar: AccionFormulario
  boton: React.ReactNode
}

export function Plantillas({ plantillas }: { plantillas: PlantillaConAcciones[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      {plantillas.map((plantilla) => (
        <li key={plantilla.id} className="flex items-center gap-4 p-4 sm:p-5">
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center self-start rounded-xl sm:size-12 sm:self-center',
              plantilla.activa ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <FileText className="size-5 sm:size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/configuracion/plantillas/${plantilla.id}`}
                className={cn(
                  'text-lg font-medium hover:text-primary hover:underline',
                  plantilla.activa ? null : 'text-muted-foreground',
                )}
              >
                {plantilla.nombre}
              </Link>
              <span
                className={cn(
                  'inline-flex h-6 items-center rounded-md bg-slate-200/70 px-2 text-sm',
                  plantilla.activa ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {plantilla.formato}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {plantilla.activa ? <Pastilla tono="exito">Activa</Pastilla> : <Pastilla>Inactiva</Pastilla>}
              <DialogoFormulario
                titulo="Renombrar plantilla"
                accion={plantilla.renombrar}
                textoBoton="Guardar nombre"
                disparador={
                  <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Renombrar ${plantilla.nombre}`}>
                    <Pencil />
                  </Button>
                }
              >
                {(estado) => (
                  <Campo id="plantilla-nombre" etiqueta="Nombre" error={estado.errores.nombre}>
                    <Input
                      id="plantilla-nombre"
                      name="nombre"
                      defaultValue={valorCampo(estado, { nombre: plantilla.nombre }, 'nombre')}
                      aria-invalid={Boolean(estado.errores.nombre)}
                    />
                  </Campo>
                )}
              </DialogoFormulario>
              {plantilla.boton}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
