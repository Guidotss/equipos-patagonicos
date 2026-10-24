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
  const texto = (
    campo: CampoCliente,
    etiqueta: string,
    props: React.ComponentProps<typeof Input> = {},
    className?: string,
  ) => (
    <Campo id={campo} etiqueta={etiqueta} error={error(campo)} className={className}>
      <Input id={campo} name={campo} defaultValue={valor(campo)} aria-invalid={Boolean(error(campo))} {...props} />
    </Campo>
  )

  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <Campo id="razon_social" etiqueta="Razón social" error={error('razon_social')} className="sm:col-span-2">
        <Input
          id="razon_social"
          name="razon_social"
          defaultValue={valor('razon_social')}
          aria-invalid={Boolean(error('razon_social'))}
          autoComplete="organization"
        />
      </Campo>
      <Campo id="cuit" etiqueta="CUIT" error={error('cuit')}>
        <Input
          id="cuit"
          name="cuit"
          inputMode="numeric"
          placeholder="Opcional para cotizar"
          defaultValue={valor('cuit')}
          aria-invalid={Boolean(error('cuit'))}
        />
      </Campo>
      <Campo id="condicion_iva" etiqueta="Condición frente al IVA" error={error('condicion_iva')}>
        {/* React no actualiza el defaultValue de un <select> ya montado y el reset del form tras la acción
            volvería al valor del montaje: la key lo remonta cuando cambia (lo enviado o lo guardado). */}
        <NativeSelect
          key={valor('condicion_iva')}
          id="condicion_iva"
          name="condicion_iva"
          defaultValue={valor('condicion_iva')}
          className="w-full"
        >
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
      {texto('direccion', 'Dirección', {}, 'sm:col-span-2')}
      {texto('localidad', 'Localidad')}
      {texto('provincia', 'Provincia')}
      {texto('condicion_pago', 'Condición de pago habitual', { placeholder: 'Ej.: 30 - 45 días F.F.' })}
      <Campo id="notas" etiqueta="Notas" error={error('notas')} className="sm:col-span-2">
        <Textarea id="notas" name="notas" rows={3} defaultValue={valor('notas')} placeholder="Escribí notas internas sobre el cliente" />
      </Campo>
    </div>
  )
}
