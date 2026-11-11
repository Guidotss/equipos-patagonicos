'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateStaffCraneOperatorAccess } from '@/app/(crane-management)/crane-operators/actions'
import { Field } from '@/components/form/field'
import { SectionForm } from '@/components/form/structure-form'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { ManagedCraneOperator } from '@/lib/crane-operators/management-contracts'
import { setCraneOperatorAccessSchema } from '@/lib/crane-operators/management-schemas'
import { errorsByPath } from '@/lib/forms'

export function AccessForm({ operator }: { operator: ManagedCraneOperator }) {
  const router = useRouter()
  const [active, setActive] = useState(operator.active)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const saving = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!message || saved) return
    ;(formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[data-access-error]'))?.focus()
  }, [message, errors, saved])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    setSaved(false)
    const parsed = setCraneOperatorAccessSchema.safeParse({ userId: operator.userId, active })
    if (!parsed.success) { setErrors(errorsByPath(parsed.error)); setMessage('Revisá los datos marcados.'); return }
    saving.current = true
    setMessage('')
    setErrors({})
    startTransition(async () => {
      try {
        const result = await updateStaffCraneOperatorAccess(parsed.data)
        if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.message); return }
        setSaved(true)
        setMessage('Acceso actualizado.')
        router.refresh()
      } catch { setMessage('Se interrumpió la operación. Reintentá con el acceso elegido.') }
      finally { saving.current = false }
    })
  }

  return <SectionForm titulo="Acceso" descripcion="Controlá si el gruista puede ingresar al portal de remitos.">
    <form ref={formRef} onSubmit={submit} noValidate aria-label="Acceso del gruista" className="flex flex-col gap-4">
      {message ? <div tabIndex={-1} data-access-error role={saved ? 'status' : undefined} className="rounded-lg outline-ring focus-visible:outline-2"><Alert variant={saved ? 'default' : 'destructive'}><AlertDescription>{message}</AlertDescription></Alert></div> : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-[minmax(9rem,15rem)_auto] sm:items-end">
        <legend className="sr-only">Estado del acceso</legend>
        <Field id="access-active" label="Acceso" error={errors.active}><NativeSelect id="access-active" className="w-full" value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}><NativeSelectOption value="active">Activo</NativeSelectOption><NativeSelectOption value="inactive">Inactivo</NativeSelectOption></NativeSelect></Field>
        <Button type="submit" disabled={pending} className="min-h-11 justify-self-start">{pending ? 'Guardando…' : 'Guardar acceso'}</Button>
      </fieldset>
    </form>
  </SectionForm>
}
