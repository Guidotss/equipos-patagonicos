'use client'

import { AlignLeft, Building2, CalendarClock, FileText, Printer } from 'lucide-react'
import Image from 'next/image'
import { Fragment } from 'react'
import { Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import {
  CamposGrilla,
  FranjaVista,
  FrasesResueltas,
  Resaltado,
  Tarjeta,
  useVistaEnVivo,
  type DefinicionCampo,
} from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { tramosPie } from '@/lib/cotizaciones/pie'
import { encabezadoFecha } from '@/lib/format/fechas'
import type { AccionFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'

type CampoDeEmpresa = DefinicionCampo & { campo: CampoEmpresa }
type Valores = Partial<Record<CampoEmpresa, string | null>>

// Agrupados por dónde se usa cada dato (ver armarDocumento y tramosPie). El pie va en el orden en que se imprime.
const CAMPOS_PIE: CampoDeEmpresa[] = [
  { campo: 'direccion', etiqueta: 'Dirección', ancho: true },
  { campo: 'ciudad', etiqueta: 'Ciudad' },
  { campo: 'telefono', etiqueta: 'Teléfono' },
  { campo: 'email', etiqueta: 'Email', ancho: true },
  { campo: 'web', etiqueta: 'Web', ancho: true },
]
const CAMPOS_TARIFAS: CampoDeEmpresa[] = [
  { campo: 'indice_base', etiqueta: 'Mes base del índice FADEEAC', placeholder: 'junio 2026' },
  { campo: 'proxima_actualizacion', etiqueta: 'Próxima actualización', placeholder: 'noviembre de 2026' },
]
const CAMPOS_FISCALES: CampoDeEmpresa[] = [
  { campo: 'razon_social', etiqueta: 'Razón social', ancho: true },
  { campo: 'cuit', etiqueta: 'CUIT', placeholder: '30-12345678-9' },
  { campo: 'provincia', etiqueta: 'Provincia' },
]

const CAMPOS_VISTA = ['direccion', 'ciudad', 'telefono', 'email', 'web', 'indice_base', 'proxima_actualizacion'] as const
type CampoVista = (typeof CAMPOS_VISTA)[number]

/** La fecha y el pie tal como los arma el PDF, con los datos de esta pantalla resaltados. */
function FranjaPdf({ hoy, valores }: { hoy: string; valores: Record<CampoVista, string> }) {
  const fecha = encabezadoFecha(valores.ciudad, hoy)
  return (
    <FranjaVista icono={Printer} titulo="Así sale en el PDF">
      <p>
        {valores.ciudad ? <Resaltado>{valores.ciudad}</Resaltado> : null}
        {fecha.slice(valores.ciudad.length)}
      </p>
      <p className="[overflow-wrap:anywhere]">
        {tramosPie(valores).map((tramo, indice) => (
          <Fragment key={indice}>
            {indice > 0 ? ' - ' : null}
            {tramo.prefijo}
            {tramo.fijo ? tramo.valor : <Resaltado>{tramo.valor}</Resaltado>}
          </Fragment>
        ))}
      </p>
      {valores.web ? (
        <p className="[overflow-wrap:anywhere]">
          <Resaltado>{valores.web}</Resaltado>
        </p>
      ) : null}
    </FranjaVista>
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
  const { vista, alEscribir, sincronizar } = useVistaEnVivo(CAMPOS_VISTA, inicial)
  const datosClave = [inicial.direccion, inicial.ciudad, inicial.email].filter(Boolean).join(' · ')

  // El de arriba queda fuera del <form> y lo envía con form={formulario}.
  const guardar = (pendiente: boolean, { form, className }: { form?: string; className?: string }) =>
    soloLectura ? null : (
      <Button
        type="submit"
        form={form}
        size="lg"
        className={cn('h-10 px-3.5 text-[15px] shadow-md shadow-primary/20', className)}
        disabled={pendiente}
      >
        {pendiente ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    )

  return (
    <FormularioAccion
      accion={accion}
      textoBoton="Guardar cambios"
      soloLectura={soloLectura}
      boton={false}
      encabezado={({ pendiente, formulario }) => (
        <EncabezadoFicha
          titulo={inicial.razon_social || 'Empresa'}
          recuadro={<Image src="/logo-gancho.png" alt="" width={90} height={95} className="h-16 w-auto" />}
          datos={datosClave || null}
          acciones={guardar(pendiente, { form: formulario })}
        />
      )}
    >
      {(estado, pendiente) => (
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
              <CamposGrilla estado={estado} inicial={inicial} campos={CAMPOS_PIE} />
            </Tarjeta>
            <div className="space-y-6">
              <Tarjeta
                icono={CalendarClock}
                titulo="Actualización de tarifas"
                descripcion="Valores por defecto de cada cotización nueva."
                franja={
                  frasesTarifas.length > 0 ? (
                    <FranjaVista icono={AlignLeft} titulo="Así sale en las condiciones">
                      <FrasesResueltas
                        frases={frasesTarifas}
                        valores={{ indice_base: vista.indice_base, proxima_actualizacion: vista.proxima_actualizacion }}
                      />
                    </FranjaVista>
                  ) : null
                }
              >
                <CamposGrilla estado={estado} inicial={inicial} campos={CAMPOS_TARIFAS} />
              </Tarjeta>
              <Tarjeta icono={Building2} titulo="Datos fiscales" descripcion="No se imprimen en las cotizaciones.">
                <CamposGrilla estado={estado} inicial={inicial} campos={CAMPOS_FISCALES} />
              </Tarjeta>
            </div>
            {/* En celular el botón de arriba queda lejos después de editar el último campo. */}
            {guardar(pendiente, { className: 'w-full lg:hidden' })}
          </div>
        </Contenido>
      )}
    </FormularioAccion>
  )
}
