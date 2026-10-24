'use client'

import { Pencil, Plus } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoFirmante } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

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
    <div className="space-y-4">
      {campo('nombre', 'Nombre')}
      {campo('cargo', 'Cargo')}
      {campo('telefono', 'Teléfono')}
      {campo('email', 'Email')}
    </div>
  )
}

export function Firmantes({ firmantes, crear }: { firmantes: FirmanteConAcciones[]; crear: AccionFormulario }) {
  return (
    <div className="space-y-4">
      <DialogoFormulario
        titulo="Nuevo firmante"
        accion={crear}
        textoBoton="Guardar firmante"
        disparador={
          <Button>
            <Plus className="size-4" aria-hidden />
            Nuevo firmante
          </Button>
        }
      >
        {(estado) => <CamposFirmante estado={estado} />}
      </DialogoFormulario>

      <ul className="divide-y rounded-md border">
        {firmantes.map((firmante) => (
          <li key={firmante.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">
                {firmante.nombre}
                {firmante.activo ? null : (
                  <Badge variant="secondary" className="ml-2">
                    Inactivo
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {[firmante.cargo, firmante.telefono, firmante.email].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <DialogoFormulario
                titulo={`Editar a ${firmante.nombre}`}
                accion={firmante.actualizar}
                textoBoton="Guardar firmante"
                disparador={
                  <Button variant="ghost" size="icon" aria-label={`Editar a ${firmante.nombre}`}>
                    <Pencil className="size-4" />
                  </Button>
                }
              >
                {(estado) => <CamposFirmante estado={estado} inicial={firmante} />}
              </DialogoFormulario>
              {firmante.boton}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
