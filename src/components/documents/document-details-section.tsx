import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { INVOICE_TYPES } from '@/lib/documents/schemas'

import type { DocumentFormValues } from './document-form-model'
import type { DocumentFormState } from './use-document-form'

export function DocumentDetailsSection({
  values,
  changeField,
  errors,
  context,
  duplicate,
}: Pick<DocumentFormState, 'values' | 'changeField' | 'errors' | 'context'> & { duplicate: string | boolean }) {
  function field(name: keyof DocumentFormValues, label: string, inputType = 'text', required = false) {
    return (
      <Field id={name} label={label} error={errors[`datos.${name}`]}>
        <Input
          id={name}
          value={values[name]}
          onChange={(event) => changeField(name, event.target.value)}
          type={inputType}
          required={required}
          maxLength={name === 'numero' || name === 'numero_oc_ref' ? 50 : undefined}
          inputMode={name === 'monto' ? 'decimal' : undefined}
          aria-invalid={Boolean(errors[`datos.${name}`])}
        />
      </Field>
    )
  }
  return (
    <Card titulo="Datos del documento">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('numero', 'Número (opcional)')}
        {field('fecha', 'Fecha (opcional)', 'date')}
        {duplicate ? (
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
                onChange={(event) => changeField('tipo_comprobante', event.target.value)}
                className="w-full"
              >
                {Object.entries(INVOICE_TYPES).map(([value, label]) => (
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
                onChange={(event) => changeField('equipo_id', event.target.value)}
              >
                <NativeSelectOption value="">Sin equipo</NativeSelectOption>
                {context.equipos.map((equipment) => (
                  <NativeSelectOption value={equipment.id} key={equipment.id}>
                    {equipment.nombre}
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
            onChange={(event) => changeField('notas', event.target.value)}
            rows={3}
            maxLength={2000}
          />
        </Field>
      </div>
    </Card>
  )
}
