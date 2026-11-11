'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { updateUserAccess } from '@/app/(app)/configuracion/users/actions'
import { Field } from '@/components/form/field'
import { SectionForm } from '@/components/form/structure-form'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ROLES, ROLE_LABELS, type Role } from '@/lib/auth/roles'
import type { UserAccess } from '@/lib/crane-operators/schemas'

export function UserAccessForm({ user, currentUserId }: { user: UserAccess; currentUserId: string }) {
  const router = useRouter()
  const [role, setRole] = useState(user.role)
  const [active, setActive] = useState(user.active)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const saving = useRef(false)
  const ownAccount = currentUserId === user.userId
  const prefix = `user-${user.userId}`

  useEffect(() => {
    if (!message || saved) return
    ;(formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[data-access-error]'))?.focus()
  }, [message, errors, saved])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    saving.current = true
    setMessage('')
    setErrors({})
    setSaved(false)
    startTransition(async () => {
      try {
        const result = await updateUserAccess({ userId: user.userId, role, active })
        if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.message); return }
        setSaved(true)
        setMessage('Acceso actualizado.')
        router.refresh()
      } catch { setMessage('No pudimos guardar el acceso. Reintentá con los datos elegidos.') }
      finally { saving.current = false }
    })
  }

  return <SectionForm titulo={user.name || user.email} descripcion={user.email} stacked>
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" aria-label={`Acceso de ${user.email}`}>
      {message ? <div tabIndex={-1} data-access-error role={saved ? 'status' : undefined} className="rounded-lg outline-ring focus-visible:outline-2"><Alert variant={saved ? 'default' : 'destructive'}><AlertDescription>{message}</AlertDescription></Alert></div> : null}
      <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <legend className="sr-only">Rol y estado</legend>
        <Field id={`${prefix}-role`} label="Rol" error={errors.role}>
          <NativeSelect id={`${prefix}-role`} className="w-full" value={role} disabled={ownAccount} onChange={(event) => setRole(event.target.value as Role)}>
            {ROLES.map((option) => <NativeSelectOption key={option} value={option}>{ROLE_LABELS[option]}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field id={`${prefix}-active`} label="Estado" error={errors.active}>
          <NativeSelect id={`${prefix}-active`} className="w-full" value={active ? 'active' : 'inactive'} disabled={ownAccount} onChange={(event) => setActive(event.target.value === 'active')}><NativeSelectOption value="active">Activo</NativeSelectOption><NativeSelectOption value="inactive">Inactivo</NativeSelectOption></NativeSelect>
        </Field>
        <Button type="submit" disabled={pending || ownAccount} className="min-h-11 lg:mb-0">{pending ? 'Guardando…' : 'Guardar acceso'}</Button>
      </fieldset>
      {ownAccount ? <p className="text-sm text-muted-foreground">Tu propio acceso de administrador se conserva para que puedas seguir gestionando el sistema.</p> : null}
    </form>
  </SectionForm>
}
