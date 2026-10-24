'use client'

import { Pencil } from 'lucide-react'
import Link from 'next/link'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'

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
    <ul className="divide-y rounded-md border">
      {plantillas.map((plantilla) => (
        <li key={plantilla.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/configuracion/plantillas/${plantilla.id}`} className="font-medium hover:underline">
              {plantilla.nombre}
            </Link>
            <Badge variant="outline">{plantilla.formato}</Badge>
            {plantilla.activa ? null : <Badge variant="secondary">Inactiva</Badge>}
          </div>
          <div className="flex items-center gap-1">
            <DialogoFormulario
              titulo="Renombrar plantilla"
              accion={plantilla.renombrar}
              textoBoton="Guardar nombre"
              disparador={
                <Button variant="ghost" size="icon" aria-label={`Renombrar ${plantilla.nombre}`}>
                  <Pencil className="size-4" />
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
        </li>
      ))}
    </ul>
  )
}
