'use client'

import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { Input } from '@/components/ui/input'
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'

type DefinicionCampo = { campo: CampoEmpresa; etiqueta: string; ayuda?: string }

const GRUPOS: { titulo: string; campos: DefinicionCampo[] }[] = [
  {
    titulo: 'Membrete',
    campos: [
      { campo: 'razon_social', etiqueta: 'Razón social' },
      { campo: 'cuit', etiqueta: 'CUIT' },
      { campo: 'direccion', etiqueta: 'Dirección' },
      { campo: 'ciudad', etiqueta: 'Ciudad', ayuda: 'Se usa en la fecha de las cotizaciones: "Neuquén, 22 de octubre de 2026."' },
      { campo: 'provincia', etiqueta: 'Provincia' },
    ],
  },
  {
    titulo: 'Contacto',
    campos: [
      { campo: 'telefono', etiqueta: 'Teléfono' },
      { campo: 'email', etiqueta: 'Email' },
      { campo: 'web', etiqueta: 'Web' },
    ],
  },
  {
    titulo: 'Actualización de tarifas',
    campos: [
      { campo: 'indice_base', etiqueta: 'Mes base del índice FADEEAC', ayuda: 'Ej.: junio 2026' },
      { campo: 'proxima_actualizacion', etiqueta: 'Próxima actualización de tarifas', ayuda: 'Ej.: noviembre de 2026' },
    ],
  },
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
    <FormularioAccion accion={accion} textoBoton="Guardar" soloLectura={soloLectura} className="space-y-8">
      {(estado) =>
        GRUPOS.map(({ titulo, campos }) => (
          <section key={titulo} className="space-y-3">
            <h2 className="font-semibold">{titulo}</h2>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {campos.map(({ campo, etiqueta, ayuda }) => (
                <Campo key={campo} id={campo} etiqueta={etiqueta} ayuda={ayuda} error={estado.errores[campo]}>
                  <Input
                    id={campo}
                    name={campo}
                    defaultValue={valorCampo(estado, inicial, campo)}
                    aria-invalid={Boolean(estado.errores[campo])}
                  />
                </Campo>
              ))}
            </div>
          </section>
        ))
      }
    </FormularioAccion>
  )
}
