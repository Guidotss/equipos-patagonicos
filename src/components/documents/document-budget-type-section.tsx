import { Card } from '@/components/form/card'
import { Field } from '@/components/form/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TIPOS_DOCUMENT } from '@/lib/documents/schemas'
import type { OptionBudget } from '@/lib/documents/screens'
import { FileText } from 'lucide-react'

import type { DocumentFormProps } from './document-form.types'
import type { DocumentFormState } from './use-document-form'

export function DocumentBudgetTypeSection({
  document,
  quote,
  searchBudget,
  setSearchBudget,
  errors,
  seleccionados,
  chooseBudget,
  values,
  changeField,
  optionsVisible,
}: Pick<DocumentFormProps, 'document'> & {
  quote: DocumentFormProps['cotizacion']
  optionsVisible: OptionBudget[]
} & Pick<
    DocumentFormState,
    'searchBudget' | 'setSearchBudget' | 'errors' | 'seleccionados' | 'chooseBudget' | 'values' | 'changeField'
  >) {
  return (
    <Card
      titulo="Presupuesto y tipo"
      descripcion="Seleccioná el presupuesto y el tipo de documento que vas a registrar."
    >
      <div className="flex flex-col gap-4">
        {!document && !quote ? (
          <div className="flex flex-col gap-3">
            <Field id="buscar-presupuesto" label="Buscar presupuesto">
              <Input
                id="buscar-presupuesto"
                placeholder="Número, cliente o trabajo"
                value={searchBudget}
                onChange={(evento) => setSearchBudget(evento.target.value)}
              />
            </Field>
            <Field id="presupuesto" label="Presupuesto" error={errors.budgets}>
              <NativeSelect
                id="presupuesto"
                className="w-full"
                value={seleccionados[0] ?? ''}
                onChange={(evento) => void chooseBudget(evento.target.value)}
                required
              >
                <NativeSelectOption value="">Elegí un presupuesto</NativeSelectOption>
                {optionsVisible.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.numero} · {item.cliente_razon_social} · {item.asunto}
                    {item.presupuesto_estado === 'finalizado' ? ' · Finalizado' : ''}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {optionsVisible.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay presupuestos con esa búsqueda.</p>
            ) : null}
          </div>
        ) : null}
        <Field id="tipo-documento" label="Tipo de documento" error={errors['datos.tipo']}>
          <ToggleGroup
            id="tipo-documento"
            type="single"
            value={values.tipo}
            onValueChange={(value) => {
              if (value) changeField('tipo', value)
            }}
            variant="outline"
            className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
            disabled={Boolean(quote)}
            aria-label="Tipo de documento"
          >
            {Object.entries(TIPOS_DOCUMENT).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="h-17 flex-col gap-1 text-xs">
                <FileText aria-hidden />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>
    </Card>
  )
}
