'use client'

import { Pencil, Plus } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { CampoEquipo } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

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
    <div className="grid gap-4 sm:grid-cols-2">
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

export function Equipos({ equipos, crear }: { equipos: EquipoConAcciones[]; crear: AccionFormulario }) {
  return (
    <div className="space-y-4">
      <DialogoFormulario
        titulo="Nuevo equipo"
        accion={crear}
        textoBoton="Guardar equipo"
        disparador={
          <Button>
            <Plus className="size-4" aria-hidden />
            Nuevo equipo
          </Button>
        }
      >
        {(estado) => <CamposEquipo estado={estado} />}
      </DialogoFormulario>

      <ul className="divide-y rounded-md border">
        {equipos.map((equipo) => (
          <li key={equipo.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="min-w-0 max-w-2xl">
              <p className="font-medium">
                {equipo.nombre}
                {equipo.activo ? null : (
                  <Badge variant="secondary" className="ml-2">
                    Inactivo
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {[equipo.capacidad_tn ? `${equipo.capacidad_tn} TN` : '', equipo.marca, equipo.modelo, equipo.identificacion]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {equipo.descripcion ? <p className="mt-1 text-sm">{equipo.descripcion}</p> : null}
            </div>
            <div className="flex items-center gap-1">
              <DialogoFormulario
                titulo={`Editar ${equipo.nombre}`}
                accion={equipo.actualizar}
                textoBoton="Guardar equipo"
                disparador={
                  <Button variant="ghost" size="icon" aria-label={`Editar ${equipo.nombre}`}>
                    <Pencil className="size-4" />
                  </Button>
                }
              >
                {(estado) => <CamposEquipo estado={estado} inicial={equipo} />}
              </DialogoFormulario>
              {equipo.boton}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
