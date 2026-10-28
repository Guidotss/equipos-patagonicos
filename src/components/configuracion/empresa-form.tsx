'use client'

import { AlignLeft, Building2, CalendarClock, FileText, Printer } from 'lucide-react'
import { Fragment } from 'react'
import { Contenido } from '@/components/app-shell/encabezado'
import { AccionesFormulario, EncabezadoFormulario, HojaFormulario } from '@/components/formulario/estructura-formulario'
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
import type { CampoEmpresa } from '@/lib/catalogos/esquemas'
import { tramosPie } from '@/lib/cotizaciones/pie'
import { encabezadoFecha } from '@/lib/format/fechas'
import type { AccionFormulario } from '@/lib/formularios'

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

  return (
    <FormularioAccion
      accion={accion}
      textoBoton="Guardar cambios"
      soloLectura={soloLectura}
      boton={false}
    >
      {(estado, pendiente) => (
        <Contenido className="max-w-6xl pb-28">
          <EncabezadoFormulario
            titulo={inicial.razon_social || 'Empresa'}
            descripcion={datosClave || 'Datos de la empresa que se usan en las cotizaciones.'}
          />
          {soloLectura ? <p className="text-sm text-muted-foreground">Solo un administrador puede modificar estos datos.</p> : null}
          <MensajeFormulario estado={estado} />
          <HojaFormulario ref={sincronizar} onInput={alEscribir}>
            <Tarjeta
              icono={FileText}
              titulo="Pie de las cotizaciones"
              descripcion="Se imprime al pie de cada página; la ciudad también encabeza la fecha."
              franja={<FranjaPdf hoy={hoy} valores={vista} />}
            >
              <CamposGrilla estado={estado} inicial={inicial} campos={CAMPOS_PIE} />
            </Tarjeta>
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
          </HojaFormulario>
          <AccionesFormulario volver="/configuracion" textoBoton="Guardar cambios" pendiente={pendiente} soloLectura={soloLectura} />
        </Contenido>
      )}
    </FormularioAccion>
  )
}
