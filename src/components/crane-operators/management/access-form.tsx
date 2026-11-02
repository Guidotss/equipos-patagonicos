'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateStaffCraneOperatorAccess } from '@/app/(crane-management)/crane-operators/actions'
import { Field } from '@/components/form/field'
import { SectionForm } from '@/components/form/structure-form'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { EquipmentOption } from '@/lib/crane-operators/contracts'
import type { ManagedCraneOperator } from '@/lib/crane-operators/management-contracts'
import { setCraneOperatorAccessSchema } from '@/lib/crane-operators/management-schemas'
import { errorsByPath } from '@/lib/forms'

export function AccessForm({ operator, equipment }: { operator: ManagedCraneOperator; equipment: EquipmentOption[] }) {
  const router = useRouter()
  const [active, setActive] = useState(operator.active)
  const [equipmentId, setEquipmentId] = useState(operator.equipmentId ?? '')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const saving = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const missingEquipment = Boolean(equipmentId && !equipment.some((option) => option.id === equipmentId))

  useEffect(() => {
    if (!message || saved) return
    ;(formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[data-access-error]'))?.focus()
  }, [message, errors, saved])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    setSaved(false)
    const parsed = setCraneOperatorAccessSchema.safeParse({ userId: operator.userId, active, equipmentId: equipmentId || null })
    if (!parsed.success) { setErrors(errorsByPath(parsed.error)); setMessage('Revisá los datos marcados.'); return }
    saving.current = true
    setMessage('')
    setErrors({})
    startTransition(async () => {
      try {
        const result = await updateStaffCraneOperatorAccess(parsed.data)
        if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.message); return }
        setSaved(true)
        setMessage('Acceso actualizado. El historial de remitos se conserva.')
        router.refresh()
      } catch { setMessage('Se interrumpió la operación. Reintentá con el acceso elegido.') }
      finally { saving.current = false }
    })
  }

  return <SectionForm titulo="Acceso y grúa" descripcion="La asignación actual se aplica a los próximos envíos. Los remitos anteriores conservan su grúa.">
    <form ref={formRef} onSubmit={submit} noValidate aria-label="Acceso del gruista" className="flex flex-col gap-4">
      {message ? <div tabIndex={-1} data-access-error role={saved ? 'status' : undefined} className="rounded-lg outline-ring focus-visible:outline-2"><Alert variant={saved ? 'default' : 'destructive'}><AlertDescription>{message}</AlertDescription></Alert></div> : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <legend className="sr-only">Estado y grúa actual</legend>
        <Field id="access-active" label="Acceso" error={errors.active}><NativeSelect id="access-active" className="w-full" value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}><NativeSelectOption value="active">Activo</NativeSelectOption><NativeSelectOption value="inactive">Inactivo</NativeSelectOption></NativeSelect></Field>
        <Field id="access-equipment" label="Grúa asignada" error={errors.equipmentId}><NativeSelect id="access-equipment" className="w-full" value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}><NativeSelectOption value="">Sin asignar</NativeSelectOption>{missingEquipment ? <NativeSelectOption value={equipmentId} disabled>{operator.equipmentName || 'Grúa anterior'} (inactiva)</NativeSelectOption> : null}{equipment.map((option) => <NativeSelectOption key={option.id} value={option.id}>{option.name}</NativeSelectOption>)}</NativeSelect></Field>
        <Button type="submit" disabled={pending} className="min-h-11 justify-self-start sm:col-span-2">{pending ? 'Guardando…' : 'Guardar acceso'}</Button>
      </fieldset>
      {missingEquipment ? <p className="text-sm text-muted-foreground">La grúa anterior está inactiva. Elegí una grúa activa para habilitar al gruista. Para guardar sin grúa activa, elegí Inactivo y Sin asignar. Su historial se conserva.</p> : null}
    </form>
  </SectionForm>
}
