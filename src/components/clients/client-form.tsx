'use client'

import { FormAction } from '@/components/form/form-action'
import { ActionsForm, SheetForm } from '@/components/form/structure-form'
import { MessageForm } from '@/components/form/message-form'
import type { ActionForm } from '@/lib/forms'
import { FieldsClient, type ValuesClient } from './fields-client'

export function ClientForm({
  accion,
  initial,
  textButton,
}: {
  accion: ActionForm
  initial?: ValuesClient
  textButton: string
}) {
  return (
    <FormAction accion={accion} textButton={textButton} button={false}>
      {(estado, pending) => <>
        <div className="mb-4"><MessageForm estado={estado} /></div>
        <SheetForm><FieldsClient estado={estado} initial={initial} /></SheetForm>
        <ActionsForm back="/clientes" textButton={textButton} pendiente={pending} detail={initial ? undefined : 'Los contactos se agregan después de crear el cliente.'} />
      </>}
    </FormAction>
  )
}
