'use client'

import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { Input } from '@/components/ui/input'
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'

const CAMPOS: { campo: CampoEmpresa; etiqueta: string; ayuda?: string }[] = [
  { campo: 'razon_social', etiqueta: 'Razón social' },
  { campo: 'cuit', etiqueta: 'CUIT' },
  { campo: 'direccion', etiqueta: 'Dirección' },
  { campo: 'ciudad', etiqueta: 'Ciudad', ayuda: 'Se usa en la fecha de las cotizaciones: "Neuquén, 22 de octubre de 2026."' },
  { campo: 'provincia', etiqueta: 'Provincia' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'email', etiqueta: 'Email' },
  { campo: 'web', etiqueta: 'Web' },
  { campo: 'indice_base', etiqueta: 'Mes base del índice FADEEAC', ayuda: 'Ej.: junio 2026' },
  { campo: 'proxima_actualizacion', etiqueta: 'Próxima actualización de tarifas', ayuda: 'Ej.: noviembre de 2026' },
]

export function EmpresaForm({
  accion,
  inicial,
  soloLectura,
}: {
  accion: AccionFormulario
  inicial: Partial<Record<CampoEmpresa, string | null>>
  soloLectura: boolean
}) {
  return (
    <FormularioAccion accion={accion} textoBoton="Guardar" soloLectura={soloLectura} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {(estado) =>
        CAMPOS.map(({ campo, etiqueta, ayuda }) => (
          <Campo key={campo} id={campo} etiqueta={etiqueta} ayuda={ayuda} error={estado.errores[campo]}>
            <Input id={campo} name={campo} defaultValue={valorCampo(estado, inicial, campo)} aria-invalid={Boolean(estado.errores[campo])} />
          </Campo>
        ))
      }
    </FormularioAccion>
  )
}
