import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { TIPOS_COMPROBANTE } from '@/lib/documents/schemas'

import type { DocumentFormValues } from './document-form-model'
import type { DocumentFormState } from './use-document-form'

export function DocumentDetailsSection({
  values,
  changeField,
  errors,
  contexto,
  duplicado,
}: Pick<DocumentFormState, 'values' | 'changeField' | 'errors' | 'contexto'> & { duplicado: string | boolean }) {
  function field(nombre: keyof DocumentFormValues, label: string, tipoInput = 'text', required = false) {
    return (
      <Field id={nombre} label={label} error={errors[`datos.${nombre}`]}>
        <Input
          id={nombre}
          value={values[nombre]}
          onChange={(evento) => changeField(nombre, evento.target.value)}
          type={tipoInput}
          required={required}
          maxLength={nombre === 'numero' || nombre === 'numero_oc_ref' ? 50 : undefined}
          inputMode={nombre === 'monto' ? 'decimal' : undefined}
          aria-invalid={Boolean(errors[`datos.${nombre}`])}
        />
      </Field>
    )
  }
  return (
    <Card titulo="Datos del documento">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('numero', 'Número (opcional)')}
        {field('fecha', 'Fecha (opcional)', 'date')}
        {duplicado ? (
          <Alert className="sm:col-span-2">
            <AlertDescription>
              Ya hay un documento del mismo tipo con este número. Revisalo antes de guardar.
            </AlertDescription>
          </Alert>
        ) : null}
        {field(
          'monto',
          values.tipo === 'factura'
            ? 'Monto total con IVA'
            : values.tipo === 'orden_pago'
              ? 'Monto de la orden de pago'
              : 'Monto (opcional)',
          'text',
          values.tipo === 'factura' || values.tipo === 'orden_pago',
        )}
        {values.tipo === 'factura' ? (
          <>
            <Field id="tipo_comprobante" label="Comprobante" error={errors['datos.tipo_comprobante']}>
              <NativeSelect
                id="tipo_comprobante"
                value={values.tipo_comprobante}
                onChange={(evento) => changeField('tipo_comprobante', evento.target.value)}
                className="w-full"
              >
                {Object.entries(TIPOS_COMPROBANTE).map(([value, label]) => (
                  <NativeSelectOption value={value} key={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {field('fecha_vencimiento', 'Vencimiento (opcional)', 'date')}
            {field('numero_oc_ref', 'OC de referencia (opcional)')}
          </>
        ) : null}
        {values.tipo === 'remito' ? (
          <>
            <Field id="equipo_id" label="Equipo (opcional)">
              <NativeSelect
                id="equipo_id"
                className="w-full"
                value={values.equipo_id}
                onChange={(evento) => changeField('equipo_id', evento.target.value)}
              >
                <NativeSelectOption value="">Sin equipo</NativeSelectOption>
                {contexto.equipos.map((equipo) => (
                  <NativeSelectOption value={equipo.id} key={equipo.id}>
                    {equipo.nombre}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {field('periodo_desde', 'Período desde (opcional)', 'date')}
            {field('periodo_hasta', 'Período hasta (opcional)', 'date')}
          </>
        ) : null}
        <Field id="notas" label="Notas (opcional)" error={errors['datos.notas']} className="sm:col-span-2">
          <Textarea
            id="notas"
            value={values.notas}
            onChange={(evento) => changeField('notas', evento.target.value)}
            rows={3}
            maxLength={2000}
          />
        </Field>
      </div>
    </Card>
  )
}
