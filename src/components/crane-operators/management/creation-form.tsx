'use client'

import Link from 'next/link'
import { Field } from '@/components/form/field'
import { ActionsForm, SectionForm, SheetForm } from '@/components/form/structure-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { EquipmentOption } from '@/lib/crane-operators/contracts'
import { useCreationForm } from './use-creation-form'

export function CreationForm({ equipment }: { equipment: EquipmentOption[] }) {
  const { values, change, message, errors, pending, formRef, submit } = useCreationForm()
  return <form ref={formRef} onSubmit={submit} noValidate aria-label="Nuevo gruista" className="flex flex-col gap-4">
    {message ? <div tabIndex={-1} data-form-error className="rounded-lg outline-ring focus-visible:outline-2"><Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert></div> : null}
    <fieldset disabled={pending} className="min-w-0">
      <legend className="sr-only">Datos del nuevo gruista</legend>
      <SheetForm>
        <SectionForm titulo="Cuenta" descripcion="Datos para ingresar al portal de remitos.">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field id="operator-name" label="Nombre" error={errors.name} className="sm:col-span-2"><Input id="operator-name" name="name" value={values.name} onChange={(event) => change('name', event.target.value)} autoComplete="name" maxLength={120} required /></Field>
            <Field id="operator-email" label="Email" error={errors.email}><Input id="operator-email" name="email" type="email" value={values.email} onChange={(event) => change('email', event.target.value)} autoComplete="email" required /></Field>
            <Field id="operator-password" label="Contraseña" error={errors.password} help="Al menos 6 caracteres. El gruista podrá usarla para ingresar."><Input id="operator-password" name="password" type="password" value={values.password} onChange={(event) => change('password', event.target.value)} autoComplete="new-password" required /></Field>
          </div>
        </SectionForm>
        <SectionForm titulo="Grúa" descripcion="Asignación actual del gruista. Podés cambiarla después sin perder su historial.">
          {equipment.length ? <Field id="operator-equipment" label="Grúa asignada" error={errors.equipmentId} help="El acceso se crea activo y con esta grúa asignada."><NativeSelect id="operator-equipment" name="equipmentId" value={values.equipmentId} onChange={(event) => change('equipmentId', event.target.value)} className="w-full" required><NativeSelectOption value="">Elegí una grúa activa</NativeSelectOption>{equipment.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}</NativeSelect></Field> : <Alert><AlertDescription>No hay grúas activas para asignar. <Link href="/configuracion/equipos" className="text-primary underline underline-offset-4">Activá o agregá una grúa</Link> para poder crear el acceso.</AlertDescription></Alert>}
        </SectionForm>
      </SheetForm>
    </fieldset>
    <ActionsForm back="/crane-operators" textButton="Crear gruista" pendiente={pending} disabled={!equipment.length} detail="El gruista podrá ingresar con la contraseña elegida." />
  </form>
}
