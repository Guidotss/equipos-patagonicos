import { Campo } from '@/components/formulario/campo'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { CONDICIONES_IVA, type CampoCliente } from '@/lib/clientes/esquemas'
import { valorCampo, type EstadoFormulario } from '@/lib/formularios'

export type ValoresCliente = Partial<Record<CampoCliente, string | null>>

export function CamposCliente({ estado, inicial }: { estado: EstadoFormulario; inicial?: ValoresCliente }) {
  const valor = (campo: CampoCliente) => valorCampo(estado, inicial, campo)
  const error = (campo: CampoCliente) => estado.errores[campo]
  const texto = (campo: CampoCliente, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Campo id={campo} etiqueta={etiqueta} error={error(campo)}>
      <Input id={campo} name={campo} defaultValue={valor(campo)} aria-invalid={Boolean(error(campo))} {...props} />
    </Campo>
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo id="razon_social" etiqueta="Razón social" error={error('razon_social')} className="sm:col-span-2">
        <Input
          id="razon_social"
          name="razon_social"
          defaultValue={valor('razon_social')}
          aria-invalid={Boolean(error('razon_social'))}
          autoComplete="organization"
        />
      </Campo>
      <Campo id="cuit" etiqueta="CUIT" error={error('cuit')} ayuda="Opcional para cotizar. Con o sin guiones.">
        <Input id="cuit" name="cuit" inputMode="numeric" defaultValue={valor('cuit')} aria-invalid={Boolean(error('cuit'))} />
      </Campo>
      <Campo id="condicion_iva" etiqueta="Condición frente al IVA" error={error('condicion_iva')}>
        <NativeSelect id="condicion_iva" name="condicion_iva" defaultValue={valor('condicion_iva')} className="w-full">
          <NativeSelectOption value="">Sin especificar</NativeSelectOption>
          {Object.entries(CONDICIONES_IVA).map(([clave, etiqueta]) => (
            <NativeSelectOption key={clave} value={clave}>
              {etiqueta}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Campo>
      {texto('email', 'Email', { type: 'email', autoComplete: 'email' })}
      {texto('telefono', 'Teléfono', { type: 'tel' })}
      {texto('direccion', 'Dirección')}
      {texto('localidad', 'Localidad')}
      {texto('provincia', 'Provincia')}
      {texto('condicion_pago', 'Condición de pago habitual', { placeholder: 'Ej.: 30 - 45 días F.F.' })}
      <Campo id="notas" etiqueta="Notas" error={error('notas')} className="sm:col-span-2">
        <Textarea id="notas" name="notas" rows={3} defaultValue={valor('notas')} />
      </Campo>
    </div>
  )
}
