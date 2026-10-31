import { Field } from '@/components/form/field'
import { SectionForm } from '@/components/form/structure-form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { CONDICIONES_IVA, type FieldClient } from '@/lib/clients/schemas'
import { valueField, type StatusForm } from '@/lib/forms'

export type ValuesClient = Partial<Record<FieldClient, string | null>>

export function FieldsClient({ estado, initial }: { estado: StatusForm; initial?: ValuesClient }) {
  const value = (field: FieldClient) => valueField(estado, initial, field)
  const error = (field: FieldClient) => estado.errors[field]
  const texto = (
    field: FieldClient,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    className?: string,
  ) => (
    <Field id={field} label={label} error={error(field)} className={className}>
      <Input id={field} name={field} defaultValue={value(field)} aria-invalid={Boolean(error(field))} {...props} />
    </Field>
  )

  return (
    <>
      <SectionForm titulo="Identificación" descripcion="Nombre y datos fiscales del cliente.">
        <div className="grid gap-4 @md:grid-cols-2">
          <Field id="razon_social" label="Razón social" error={error('razon_social')} className="@md:col-span-2">
            <Input
              id="razon_social"
              name="razon_social"
              defaultValue={value('razon_social')}
              aria-invalid={Boolean(error('razon_social'))}
              autoComplete="organization"
            />
          </Field>
          <Field id="cuit" label="CUIT" error={error('cuit')}>
            <Input
              id="cuit"
              name="cuit"
              inputMode="numeric"
              placeholder="Opcional para cotizar"
              defaultValue={value('cuit')}
              aria-invalid={Boolean(error('cuit'))}
            />
          </Field>
          <Field id="condicion_iva" label="Condición frente al IVA" error={error('condicion_iva')}>
            {/* React no actualiza el defaultValue de un <select> ya montado y el reset del form tras la acción
                volvería al valor del montaje: la key lo remonta cuando cambia (lo enviado o lo guardado). */}
            <NativeSelect
              key={value('condicion_iva')}
              id="condicion_iva"
              name="condicion_iva"
              defaultValue={value('condicion_iva')}
              className="w-full"
            >
              <NativeSelectOption value="">Sin especificar</NativeSelectOption>
              {Object.entries(CONDICIONES_IVA).map(([clave, label]) => (
                <NativeSelectOption key={clave} value={clave}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </SectionForm>
      <SectionForm titulo="Contacto y domicilio" descripcion="Datos para comunicarte con el cliente.">
        <div className="grid gap-4 @md:grid-cols-2">
          {texto('email', 'Email', { type: 'email', autoComplete: 'email' })}
          {texto('telefono', 'Teléfono', { type: 'tel' })}
          {texto('direccion', 'Dirección', { autoComplete: 'street-address' }, '@md:col-span-2')}
          {texto('localidad', 'Localidad')}
          {texto('provincia', 'Provincia')}
        </div>
      </SectionForm>
      <SectionForm titulo="Gestión comercial" descripcion="Condiciones habituales y notas internas.">
        <div className="space-y-4">
          {texto('condicion_pago', 'Condición de pago habitual', { placeholder: 'Ej.: 30 - 45 días F.F.' })}
          <Field id="notas" label="Notas" error={error('notas')}>
            <Textarea id="notas" name="notas" rows={3} defaultValue={value('notas')} placeholder="Escribí notas internas sobre el cliente" />
          </Field>
        </div>
      </SectionForm>
    </>
  )
}
