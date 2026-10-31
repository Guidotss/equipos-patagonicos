'use client'

import { AlignLeft, Building2, CalendarClock, FileText, Printer } from 'lucide-react'
import { Fragment } from 'react'
import { Content } from '@/components/app-shell/header'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { FormAction } from '@/components/form/form-action'
import { MessageForm } from '@/components/form/message-form'
import {
  FieldsGrid,
  BandView,
  PhrasesResolved,
  Highlight,
  Card,
  useViewInLive,
  type DefinitionField,
} from '@/components/form/card'
import type { FieldCompany } from '@/lib/catalogs/schemas'
import { tramosFooter } from '@/lib/quotes/footer'
import { headerDate } from '@/lib/format/dates'
import type { ActionForm } from '@/lib/forms'

type FieldOfCompany = DefinitionField & { campo: FieldCompany }
type Values = Partial<Record<FieldCompany, string | null>>

// Agrupados por dónde se usa cada dato (ver armarDocumento y tramosPie). El pie va en el orden en que se imprime.
const FIELDS_FOOTER: FieldOfCompany[] = [
  { campo: 'direccion', label: 'Dirección', ancho: true },
  { campo: 'ciudad', label: 'Ciudad' },
  { campo: 'telefono', label: 'Teléfono' },
  { campo: 'email', label: 'Email', ancho: true },
  { campo: 'web', label: 'Web', ancho: true },
]
const FIELDS_TARIFAS: FieldOfCompany[] = [
  { campo: 'indice_base', label: 'Mes base del índice FADEEAC', placeholder: 'junio 2026' },
  { campo: 'proxima_actualizacion', label: 'Próxima actualización', placeholder: 'noviembre de 2026' },
]
const FIELDS_FISCALES: FieldOfCompany[] = [
  { campo: 'razon_social', label: 'Razón social', ancho: true },
  { campo: 'cuit', label: 'CUIT', placeholder: '30-12345678-9' },
  { campo: 'provincia', label: 'Provincia' },
]

const FIELDS_VIEW = ['direccion', 'ciudad', 'telefono', 'email', 'web', 'indice_base', 'proxima_actualizacion'] as const
type FieldView = (typeof FIELDS_VIEW)[number]

/** La fecha y el pie tal como los arma el PDF, con los datos de esta pantalla resaltados. */
function BandPdf({ today, values }: { today: string; values: Record<FieldView, string> }) {
  const fecha = headerDate(values.ciudad, today)
  return (
    <BandView icon={Printer} titulo="Así sale en el PDF">
      <p>
        {values.ciudad ? <Highlight>{values.ciudad}</Highlight> : null}
        {fecha.slice(values.ciudad.length)}
      </p>
      <p className="[overflow-wrap:anywhere]">
        {tramosFooter(values).map((tramo, index) => (
          <Fragment key={index}>
            {index > 0 ? ' - ' : null}
            {tramo.prefix}
            {tramo.fijo ? tramo.value : <Highlight>{tramo.value}</Highlight>}
          </Fragment>
        ))}
      </p>
      {values.web ? (
        <p className="[overflow-wrap:anywhere]">
          <Highlight>{values.web}</Highlight>
        </p>
      ) : null}
    </BandView>
  )
}

export function CompanyForm({
  accion,
  initial,
  soloQuery,
  today,
  phrasesTarifas,
}: {
  accion: ActionForm
  initial: Values
  soloQuery: boolean
  /** Fecha (YYYY-MM-DD) de "Así sale en el PDF"; viene del servidor para que coincida con el HTML inicial. */
  today: string
  /** Oraciones de las plantillas activas con {{indice_base}} o {{proxima_actualizacion}}. */
  phrasesTarifas: string[]
}) {
  const { view, onEscribir, sincronizar } = useViewInLive(FIELDS_VIEW, initial)
  const dataKey = [initial.direccion, initial.ciudad, initial.email].filter(Boolean).join(' · ')

  return (
    <FormAction
      accion={accion}
      textButton="Guardar cambios"
      soloQuery={soloQuery}
      button={false}
    >
      {(estado, pending) => (
        <Content className="max-w-6xl pb-28">
          <HeaderForm
            titulo={initial.razon_social || 'Empresa'}
            descripcion={dataKey || 'Datos de la empresa que se usan en las cotizaciones.'}
          />
          {soloQuery ? <p className="text-sm text-muted-foreground">Solo un administrador puede modificar estos datos.</p> : null}
          <MessageForm estado={estado} />
          <SheetForm ref={sincronizar} onInput={onEscribir}>
            <Card
              icon={FileText}
              titulo="Pie de las cotizaciones"
              descripcion="Se imprime al pie de cada página; la ciudad también encabeza la fecha."
              band={<BandPdf today={today} values={view} />}
            >
              <FieldsGrid estado={estado} initial={initial} fields={FIELDS_FOOTER} />
            </Card>
            <Card
              icon={CalendarClock}
              titulo="Actualización de tarifas"
              descripcion="Valores por defecto de cada cotización nueva."
              band={
                phrasesTarifas.length > 0 ? (
                  <BandView icon={AlignLeft} titulo="Así sale en las condiciones">
                    <PhrasesResolved
                      phrases={phrasesTarifas}
                      values={{ indice_base: view.indice_base, proxima_actualizacion: view.proxima_actualizacion }}
                    />
                  </BandView>
                ) : null
              }
            >
              <FieldsGrid estado={estado} initial={initial} fields={FIELDS_TARIFAS} />
            </Card>
            <Card icon={Building2} titulo="Datos fiscales" descripcion="No se imprimen en las cotizaciones.">
              <FieldsGrid estado={estado} initial={initial} fields={FIELDS_FISCALES} />
            </Card>
          </SheetForm>
          <ActionsForm back="/configuracion" textButton="Guardar cambios" pendiente={pending} soloQuery={soloQuery} />
        </Content>
      )}
    </FormAction>
  )
}
