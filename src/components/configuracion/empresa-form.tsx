'use client'

import { AlignLeft, Building2, CalendarClock, FileText, Printer, type LucideIcon } from 'lucide-react'
import Image from 'next/image'
import { Fragment, useCallback, useState } from 'react'
import { Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { tramosPie } from '@/lib/cotizaciones/pie'
import { encabezadoFecha } from '@/lib/format/fechas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { partirVariables } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

type DefinicionCampo = { campo: CampoEmpresa; etiqueta: string; placeholder?: string; ancho?: boolean }
type Valores = Partial<Record<CampoEmpresa, string | null>>

// Agrupados por dónde se usa cada dato (ver armarDocumento y tramosPie). El pie va en el orden en que se imprime.
const CAMPOS_PIE: DefinicionCampo[] = [
  { campo: 'direccion', etiqueta: 'Dirección', ancho: true },
  { campo: 'ciudad', etiqueta: 'Ciudad' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'email', etiqueta: 'Email', ancho: true },
  { campo: 'web', etiqueta: 'Web', ancho: true },
]
const CAMPOS_TARIFAS: DefinicionCampo[] = [
  { campo: 'indice_base', etiqueta: 'Mes base del índice FADEEAC', placeholder: 'junio 2026' },
  { campo: 'proxima_actualizacion', etiqueta: 'Próxima actualización', placeholder: 'noviembre de 2026' },
]
const CAMPOS_FISCALES: DefinicionCampo[] = [
  { campo: 'razon_social', etiqueta: 'Razón social', ancho: true },
  { campo: 'cuit', etiqueta: 'CUIT', placeholder: '30-12345678-9' },
  { campo: 'provincia', etiqueta: 'Provincia' },
]

const CAMPOS_VISTA = ['direccion', 'ciudad', 'telefono', 'email', 'web', 'indice_base', 'proxima_actualizacion'] as const
type CampoVista = (typeof CAMPOS_VISTA)[number]

/** Lo que muestran los inputs, recortado como lo guarda esquemaEmpresa. */
function leerVista(form: HTMLFormElement): Record<CampoVista, string> {
  return Object.fromEntries(
    CAMPOS_VISTA.map((campo) => [campo, (form.elements.namedItem(campo) as HTMLInputElement | null)?.value.trim() ?? '']),
  ) as Record<CampoVista, string>
}

function Marca({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-sm bg-primary/10 px-0.5 text-inherit">{children}</mark>
}

function Campos({ estado, inicial, campos }: { estado: EstadoFormulario; inicial: Valores; campos: DefinicionCampo[] }) {
  return (
    // Dos columnas según el ancho de la tarjeta, no de la ventana: las de la derecha son angostas.
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
  )
}

function Tarjeta({
  icono: Icono,
  titulo,
  descripcion,
  franja,
  children,
}: {
  icono: LucideIcon
  titulo: string
  descripcion: string
  franja?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="@container overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <Icono className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-lg leading-tight font-medium">{titulo}</h2>
            <p className="text-sm text-muted-foreground">{descripcion}</p>
          </div>
        </div>
        {children}
      </div>
      {franja ? <div className="space-y-1 border-t bg-muted/60 px-5 py-4 text-sm sm:px-6">{franja}</div> : null}
    </section>
  )
}

function TituloFranja({ icono: Icono, children }: { icono: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
      <Icono className="size-3.5" aria-hidden />
      {children}
    </p>
  )
}

/** La fecha y el pie tal como los arma el PDF, con los datos de esta pantalla resaltados. */
function FranjaPdf({ hoy, valores }: { hoy: string; valores: Record<CampoVista, string> }) {
  const fecha = encabezadoFecha(valores.ciudad, hoy)
  return (
    <>
      <TituloFranja icono={Printer}>Así sale en el PDF</TituloFranja>
      <p>
        {valores.ciudad ? <Marca>{valores.ciudad}</Marca> : null}
        {fecha.slice(valores.ciudad.length)}
      </p>
      <p className="[overflow-wrap:anywhere]">
        {tramosPie(valores).map((tramo, indice) => (
          <Fragment key={indice}>
            {indice > 0 ? ' - ' : null}
            {tramo.prefijo}
            {tramo.fijo ? tramo.valor : <Marca>{tramo.valor}</Marca>}
          </Fragment>
        ))}
      </p>
      {valores.web ? (
        <p className="[overflow-wrap:anywhere]">
          <Marca>{valores.web}</Marca>
        </p>
      ) : null}
    </>
  )
}

/** Las oraciones de las plantillas activas que usan estos datos, completadas con lo escrito. */
function FranjaCondiciones({ frases, valores }: { frases: string[]; valores: Record<CampoVista, string> }) {
  return (
    <>
      <TituloFranja icono={AlignLeft}>Así sale en las condiciones</TituloFranja>
      {frases.map((frase) => (
        <p key={frase}>
          {partirVariables(frase).map((parte, indice) => {
            if (indice % 2 === 0) return parte
            // Solo se completan las dos variables de esta tarjeta; el resto queda como en la plantilla.
            if (parte !== 'indice_base' && parte !== 'proxima_actualizacion') return `{{${parte}}}`
            return <Marca key={indice}>{valores[parte] || '—'}</Marca>
          })}
        </p>
      ))}
    </>
  )
}

export function EmpresaForm({
  accion,
  inicial,
  soloLectura,
  hoy,
  frasesTarifas,
}: {
  accion: AccionFormulario
  inicial: Valores
  soloLectura: boolean
  /** Fecha (YYYY-MM-DD) de "Así sale en el PDF"; viene del servidor para que coincida con el HTML inicial. */
  hoy: string
  /** Oraciones de las plantillas activas con {{indice_base}} o {{proxima_actualizacion}}. */
  frasesTarifas: string[]
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

  const datosClave = [inicial.direccion, inicial.ciudad, inicial.email].filter(Boolean).join(' · ')

  return (
    <FormularioAccion accion={accion} textoBoton="Guardar cambios" soloLectura={soloLectura} boton={false}>
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
            <EncabezadoFicha
              titulo={inicial.razon_social || 'Empresa'}
              recuadro={<Image src="/logo-gancho.png" alt="" width={90} height={95} className="h-16 w-auto" />}
              datos={datosClave || null}
              acciones={guardar()}
            />
            <Contenido>
              {soloLectura ? <p className="text-sm text-muted-foreground">Solo un administrador puede modificar estos datos.</p> : null}
              {/* Arriba, cerca de Guardar: los errores generales no tienen un campo donde mostrarse. */}
              <MensajeFormulario estado={estado} />
              <div ref={sincronizar} onInput={alEscribir} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <Tarjeta
                  icono={FileText}
                  titulo="Pie de las cotizaciones"
                  descripcion="Se imprime al pie de cada página; la ciudad también encabeza la fecha."
                  franja={<FranjaPdf hoy={hoy} valores={vista} />}
                >
                  <Campos estado={estado} inicial={inicial} campos={CAMPOS_PIE} />
                </Tarjeta>
                <div className="space-y-6">
                  <Tarjeta
                    icono={CalendarClock}
                    titulo="Actualización de tarifas"
                    descripcion="Valores por defecto de cada cotización nueva."
                    franja={frasesTarifas.length > 0 ? <FranjaCondiciones frases={frasesTarifas} valores={vista} /> : null}
                  >
                    <Campos estado={estado} inicial={inicial} campos={CAMPOS_TARIFAS} />
                  </Tarjeta>
                  <Tarjeta icono={Building2} titulo="Datos fiscales" descripcion="No se imprimen en las cotizaciones.">
                    <Campos estado={estado} inicial={inicial} campos={CAMPOS_FISCALES} />
                  </Tarjeta>
                </div>
                {/* En celular el botón de arriba queda lejos después de editar el último campo. */}
                {guardar('w-full lg:hidden')}
              </div>
            </Contenido>
          </>
        )
      }}
    </FormularioAccion>
  )
}
