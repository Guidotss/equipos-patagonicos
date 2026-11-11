'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createStaffCraneOperator } from '@/app/(crane-management)/crane-operators/actions'
import { newCraneOperatorSchema, type NewCraneOperatorInput } from '@/lib/crane-operators/management-schemas'
import { errorsByPath } from '@/lib/forms'

const initialValues: NewCraneOperatorInput = { name: '', email: '', password: '' }

export function useCreationForm() {
  const router = useRouter()
  const [values, setValues] = useState(initialValues)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const saving = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!message) return
    ;(formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? formRef.current?.querySelector<HTMLElement>('[data-form-error]'))?.focus()
  }, [message, errors])

  function change(field: keyof NewCraneOperatorInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    const parsed = newCraneOperatorSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(errorsByPath(parsed.error))
      setMessage('Revisá los datos marcados.')
      return
    }
    saving.current = true
    setErrors({})
    setMessage('')
    startTransition(async () => {
      try {
        const result = await createStaffCraneOperator(parsed.data)
        if (!result.ok) { setErrors(result.errors ?? {}); setMessage(result.message); return }
        setValues(initialValues)
        toast.success('Gruista creado. Ya puede ingresar con el email y la contraseña que elegiste.')
        router.push(`/crane-operators/${result.datos.userId}`)
      } catch {
        setMessage('Se interrumpió el alta. Reintentá con los datos que ingresaste. Si ya se creó la cuenta, buscala en Gruistas.')
      } finally {
        saving.current = false
      }
    })
  }

  return { values, change, message, errors, pending, formRef, submit }
}
