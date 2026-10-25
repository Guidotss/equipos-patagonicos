'use client'

import Image from 'next/image'
import { useCallback, useState } from 'react'
import { EncabezadoPagina } from '@/components/app-shell/encabezado'
import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { lineaPie } from '@/lib/cotizaciones/pie'
import { encabezadoFecha } from '@/lib/format/fechas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'

type DefinicionCampo = { campo: CampoEmpresa; etiqueta: string; placeholder?: string; ancho?: boolean }

// Agrupados por dónde se usa cada dato (ver armarDocumento y lineaPie).
const GRUPOS: { titulo: string; descripcion: string; campos: DefinicionCampo[] }[] = [
  {
    titulo: 'Datos fiscales',
    descripcion: 'Identifican a la empresa.',
    campos: [
      { campo: 'razon_social', etiqueta: 'Razón social', ancho: true },
      { campo: 'cuit', etiqueta: 'CUIT', placeholder: '30-12345678-9' },
      { campo: 'provincia', etiqueta: 'Provincia' },
    ],
  },
  {
    titulo: 'Pie de las cotizaciones',
    descripcion: 'Se imprimen al pie de cada página; la ciudad también encabeza la fecha.',
    campos: [
      { campo: 'direccion', etiqueta: 'Dirección' },
      { campo: 'ciudad', etiqueta: 'Ciudad' },
      { campo: 'telefono', etiqueta: 'Teléfono' },
      { campo: 'web', etiqueta: 'Web' },
      { campo: 'email', etiqueta: 'Email', ancho: true },
    ],
  },
  {
    titulo: 'Actualización de tarifas',
    descripcion: 'Valores por defecto en las condiciones de cada cotización nueva.',
    campos: [
      { campo: 'indice_base', etiqueta: 'Mes base del índice FADEEAC', placeholder: 'junio 2026' },
      { campo: 'proxima_actualizacion', etiqueta: 'Próxima actualización', placeholder: 'noviembre de 2026' },
    ],
  },
]

const CAMPOS_VISTA = ['direccion', 'ciudad', 'telefono', 'email', 'web'] as const
type CampoVista = (typeof CAMPOS_VISTA)[number]

/** Lo que muestran los inputs, recortado como lo guarda esquemaEmpresa. */
function leerVista(form: HTMLFormElement): Record<CampoVista, string> {
  return Object.fromEntries(
    CAMPOS_VISTA.map((campo) => [campo, (form.elements.namedItem(campo) as HTMLInputElement | null)?.value.trim() ?? '']),
  ) as Record<CampoVista, string>
}

const LINEAS_CUERPO = ['w-1/3', 'w-full', 'w-full', 'w-full', 'w-3/4', 'mt-3 w-full', 'w-full', 'w-full', 'w-3/4']

/** Hoja A4 en miniatura con lo que estos datos cambian en el PDF: la fecha y el pie. */
function VistaPrevia({ hoy, valores }: { hoy: string; valores: Record<CampoVista, string> }) {
  const fecha = encabezadoFecha(valores.ciudad, hoy)
  return (
    <aside aria-label="Vista previa del PDF" className="space-y-4 rounded-xl bg-muted p-5 lg:sticky lg:top-20">
      <div className="space-y-0.5">
        <h2 className="text-lg font-medium">Vista previa</h2>
        <p className="text-sm text-muted-foreground">Se actualiza mientras escribís.</p>
      </div>
      <div className="mx-auto flex aspect-[210/297] w-full max-w-72 flex-col bg-white px-[9%] pt-[7%] pb-[5%] text-slate-800 shadow-lg ring-1 ring-black/5">
        <Image src="/logo-equipos-patagonicos.png" alt="" width={437} height={95} className="w-[30%] self-end" />
        <p className="mt-4 self-end text-[9px]">
          {valores.ciudad ? <mark className="rounded-sm bg-primary/15 px-0.5 text-inherit">{valores.ciudad}</mark> : null}
          {fecha.slice(valores.ciudad.length)}
        </p>
        <div aria-hidden className="mt-5 space-y-1.5">
          {LINEAS_CUERPO.map((ancho, indice) => (
            <div key={indice} className={cn('h-1 rounded-full bg-slate-200', ancho)} />
          ))}
        </div>
        <div className="mt-auto border-t border-slate-300 pt-1.5 text-center text-[8px] leading-snug [overflow-wrap:anywhere]">
          <span className="rounded-sm bg-primary/10 box-decoration-clone px-0.5">
            {lineaPie(valores)}
            {valores.web ? (
              <>
                <br />
                {valores.web}
              </>
            ) : null}
          </span>
        </div>
      </div>
    </aside>
  )
}

function TarjetaCampos({ estado, inicial }: { estado: EstadoFormulario; inicial: Partial<Record<CampoEmpresa, string | null>> }) {
  return (
    <div className="divide-y rounded-xl border bg-card shadow-tarjeta">
      {GRUPOS.map(({ titulo, descripcion, campos }) => (
        <section key={titulo} className="@container space-y-4 p-5 sm:p-6">
          <div className="space-y-0.5">
            <h2 className="text-lg font-medium">{titulo}</h2>
            <p className="text-[15px] text-muted-foreground">{descripcion}</p>
          </div>
          {/* Dos columnas según el ancho del grupo, no de la ventana: con la vista previa al lado queda angosto. */}
          <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
            {campos.map(({ campo, etiqueta, placeholder, ancho }) => (
              <Campo key={campo} id={campo} etiqueta={etiqueta} error={estado.errores[campo]} className={ancho ? '@md:col-span-2' : undefined}>
                <Input
                  id={campo}
                  name={campo}
                  placeholder={placeholder}
                  defaultValue={valorCampo(estado, inicial, campo)}
                  aria-invalid={Boolean(estado.errores[campo])}
                />
              </Campo>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function EmpresaForm({
  accion,
  inicial,
  soloLectura,
  hoy,
}: {
  accion: AccionFormulario
  inicial: Partial<Record<CampoEmpresa, string | null>>
  soloLectura: boolean
  /** Fecha (YYYY-MM-DD) de la vista previa; viene del servidor para que coincida con el HTML inicial. */
  hoy: string
}) {
  const [vista, setVista] = useState(
    () => Object.fromEntries(CAMPOS_VISTA.map((campo) => [campo, inicial[campo] ?? ''])) as Record<CampoVista, string>,
  )

  function alEscribir(evento: React.FormEvent<HTMLDivElement>) {
    const { name, value } = evento.target as HTMLInputElement
    if ((CAMPOS_VISTA as readonly string[]).includes(name)) setVista((previa) => ({ ...previa, [name]: value.trim() }))
  }

  // Si el navegador restaura lo escrito al volver con "Atrás", no dispara input: se lee al montar.
  const sincronizar = useCallback((div: HTMLDivElement | null) => {
    const form = div?.closest('form')
    if (form) setVista(leerVista(form))
  }, [])

  return (
    <FormularioAccion accion={accion} textoBoton="Guardar cambios" soloLectura={soloLectura} boton={false} className="space-y-6">
      {(estado, pendiente) => {
        const guardar = (className?: string) =>
          soloLectura ? null : (
            <Button
              type="submit"
              size="lg"
              className={cn('h-10 px-3.5 text-[15px] shadow-md shadow-primary/20', className)}
              disabled={pendiente}
            >
              {pendiente ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          )

        return (
          <>
            <EncabezadoPagina
              titulo="Empresa"
              descripcion={
                soloLectura ? 'Solo un administrador puede modificar estos datos.' : 'Datos de la empresa que usan las cotizaciones.'
              }
              acciones={guardar()}
            />
            {/* Arriba, cerca de Guardar: los errores generales no tienen un campo donde mostrarse. */}
            <MensajeFormulario estado={estado} />
            <div ref={sincronizar} onInput={alEscribir} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-4">
                <TarjetaCampos estado={estado} inicial={inicial} />
                {/* En celular el botón de arriba queda lejos después de editar el último campo. */}
                {guardar('w-full lg:hidden')}
              </div>
              <VistaPrevia hoy={hoy} valores={vista} />
            </div>
          </>
        )
      }}
    </FormularioAccion>
  )
}
